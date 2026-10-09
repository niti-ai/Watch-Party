import { Server, Socket } from 'socket.io';
import { ACTIONS, Action, Participant, Room, RoomManager } from './room';

type Ack = (r: any) => void;

/** Routes socket events to room logic. Every privileged event is permission-checked here. */
export class MessageHandler {
  constructor(private io: Server, private rooms: RoomManager) {}

  start() {
    this.io.on('connection', s => this.bind(s));
    // Periodic re-sync so late/drifting clients converge.
    setInterval(() => {
      for (const r of this.rooms.all()) if (r.snapshot().playState === 'playing') this.io.to(r.id).emit('sync_state', r.snapshot());
    }, 5000);
  }

  private bind(s: Socket) {
    let roomId: string | undefined;
    const ctx = () => {
      const room = roomId ? this.rooms.get(roomId) : undefined;
      const me = room?.get(s.id);
      return room && me ? { room, me } : null;
    };
    const deny = (msg = 'You do not have permission to do that') => s.emit('error_msg', { message: msg });

    const enter = (room: Room, name: string, create: boolean, ack: Ack) => {
      const me = new Participant(s.id, name, create ? 'host' : 'participant');
      room.join(me);
      roomId = room.id;
      s.join(room.id);
      ack({ ok: true, roomId: room.id, userId: s.id, participants: room.list(), state: room.snapshot() });
      s.to(room.id).emit('user_joined', { username: me.username, userId: me.id, role: me.role, participants: room.list() });
      this.pushRequests(room);
    };
    const clean = (n: unknown) => String(n ?? '').trim().slice(0, 24);

    s.on('create_room', (d: any, ack: Ack = () => {}) => {
      const name = clean(d?.username);
      if (!name) return ack({ ok: false, error: 'Enter a name first' });
      enter(this.rooms.create(), name, true, ack);
    });

    s.on('join_room', (d: any, ack: Ack = () => {}) => {
      const name = clean(d?.username);
      if (!name) return ack({ ok: false, error: 'Enter a name first' });
      const room = this.rooms.get(String(d?.roomId ?? '').trim().toUpperCase());
      if (!room) return ack({ ok: false, error: 'No room with that code' });
      if (room.size >= 100) return ack({ ok: false, error: 'Room is full' });
      this.leave(s, roomId);
      enter(room, name, false, ack);
    });

    s.on('leave_room', () => { this.leave(s, roomId); roomId = undefined; });
    s.on('disconnect', () => this.leave(s, roomId));

    // Playback events: Host / Moderator only.
    for (const a of ACTIONS) {
      s.on(a, (payload: any) => {
        const c = ctx(); if (!c) return;
        if (!c.me.canControl) return deny('Only the host or a moderator can control playback');
        if (!c.room.apply(a, payload ?? {})) return deny('Invalid request');
        this.io.to(c.room.id).emit('sync_state', c.room.snapshot());
      });
    }

    // Participants ask; host/mods approve or reject.
    s.on('request_change', (d: any) => {
      const c = ctx(); if (!c) return;
      if (c.me.canControl) return deny('You can make this change directly');
      if (!ACTIONS.includes(d?.type)) return deny('Invalid request');
      const type: Action = d.type;
      const probe = { ...d.payload };
      if (type === 'change_video' && !/^[A-Za-z0-9_-]{11}$/.test(String(probe.videoId))) return deny('Invalid video');
      if (type === 'seek' && typeof probe.time !== 'number') return deny('Invalid time');
      const r = c.room.addRequest(c.me, type, { time: probe.time, videoId: probe.videoId });
      if (!r) return deny('Too many pending requests');
      s.emit('request_sent', { type });
      this.pushRequests(c.room);
    });

    s.on('resolve_request', (d: any) => {
      const c = ctx(); if (!c) return;
      if (!c.me.canControl) return deny();
      const r = c.room.takeRequest(String(d?.requestId));
      if (!r) return;
      const approved = !!d?.approve;
      if (approved) { c.room.apply(r.type, r.payload); this.io.to(c.room.id).emit('sync_state', c.room.snapshot()); }
      this.io.to(c.room.id).emit('request_resolved', { requestId: r.id, username: r.username, type: r.type, approved, by: c.me.username });
      this.pushRequests(c.room);
    });

    // Host-only management.
    s.on('assign_role', (d: any) => {
      const c = ctx(); if (!c) return;
      if (c.me.role !== 'host') return deny('Only the host can assign roles');
      const t = c.room.get(String(d?.userId));
      if (!t || t.id === c.me.id || !['moderator', 'participant'].includes(d?.role)) return deny('Invalid role change');
      t.role = d.role;
      this.io.to(c.room.id).emit('role_assigned', { userId: t.id, username: t.username, role: t.role, participants: c.room.list() });
      this.pushRequests(c.room);
    });

    s.on('remove_participant', (d: any) => {
      const c = ctx(); if (!c) return;
      if (c.me.role !== 'host') return deny('Only the host can remove participants');
      const t = c.room.get(String(d?.userId));
      if (!t || t.id === c.me.id) return deny('Invalid target');
      c.room.leave(t.id);
      this.io.to(c.room.id).emit('participant_removed', { userId: t.id, username: t.username, participants: c.room.list() });
      this.io.to(t.id).emit('kicked');
      this.io.in(t.id).socketsLeave(c.room.id);
      this.pushRequests(c.room);
    });

    s.on('transfer_host', (d: any) => {
      const c = ctx(); if (!c) return;
      if (c.me.role !== 'host') return deny('Only the host can transfer host');
      const t = c.room.get(String(d?.userId));
      if (!t || t.id === c.me.id) return deny('Invalid target');
      t.role = 'host'; c.me.role = 'moderator';
      this.io.to(c.room.id).emit('host_transferred', { userId: t.id, username: t.username, participants: c.room.list() });
      this.pushRequests(c.room);
    });

    s.on('reaction', (d: any) => {
      const c = ctx(); if (!c) return;
      if (!['🔥', '😂', '😮', '❤️', '👏'].includes(d?.emoji)) return;
      this.io.to(c.room.id).emit('reaction', { userId: c.me.id, username: c.me.username, emoji: d.emoji });
    });

    s.on('chat', (d: any) => {
      const c = ctx(); if (!c) return;
      const text = String(d?.text ?? '').trim().slice(0, 300);
      if (text) this.io.to(c.room.id).emit('chat_message', { userId: c.me.id, username: c.me.username, role: c.me.role, text, ts: Date.now() });
    });
  }

  private leave(s: Socket, roomId?: string) {
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const p = room?.leave(s.id);
    if (!room || !p) return;
    s.leave(room.id);
    if (room.size === 0) return this.rooms.remove(room.id);
    this.io.to(room.id).emit('user_left', { username: p.username, userId: p.id, participants: room.list() });
    const promoted = room.ensureHost();
    if (promoted) this.io.to(room.id).emit('host_transferred', { userId: promoted.id, username: promoted.username, participants: room.list() });
    this.pushRequests(room);
  }

  /** Controllers see the pending list; everyone else gets an empty one. */
  private pushRequests(room: Room) {
    for (const p of room.all()) this.io.to(p.id).emit('requests_updated', { requests: p.canControl ? room.requests : [] });
  }
}
