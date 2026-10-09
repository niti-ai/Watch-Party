import { randomInt } from 'crypto';

export type Role = 'host' | 'moderator' | 'participant';
export type Action = 'play' | 'pause' | 'seek' | 'change_video';
export const ACTIONS: Action[] = ['play', 'pause', 'seek', 'change_video'];
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export class Participant {
  constructor(readonly id: string, public username: string, public role: Role) {}
  get canControl() { return this.role === 'host' || this.role === 'moderator'; }
  toJSON() { return { userId: this.id, username: this.username, role: this.role }; }
}

export interface ChangeRequest {
  id: string; userId: string; username: string; type: Action;
  payload: { time?: number; videoId?: string };
}

/** Owns participants, playback state and pending change requests for one room. */
export class Room {
  private members = new Map<string, Participant>();
  private st = { playState: 'paused' as 'playing' | 'paused', time: 0, videoId: 'M7lc1UVf-VE', at: Date.now() };
  requests: ChangeRequest[] = [];
  private reqSeq = 0;

  constructor(readonly id: string) {}

  get size() { return this.members.size; }
  get(id: string) { return this.members.get(id); }
  all() { return [...this.members.values()]; }
  list() { return this.all().map(p => p.toJSON()); }
  join(p: Participant) { this.members.set(p.id, p); }

  leave(id: string) {
    const p = this.members.get(id);
    this.members.delete(id);
    this.requests = this.requests.filter(r => r.userId !== id);
    return p;
  }

  /** If the host is gone, promote the oldest moderator, else the oldest participant. */
  ensureHost(): Participant | undefined {
    if (this.all().some(p => p.role === 'host')) return;
    const next = this.all().find(p => p.role === 'moderator') ?? this.all()[0];
    if (next) next.role = 'host';
    return next;
  }

  private now() {
    return this.st.playState === 'playing' ? this.st.time + (Date.now() - this.st.at) / 1000 : this.st.time;
  }
  private set(ps: 'playing' | 'paused', t: number) { this.st = { ...this.st, playState: ps, time: t, at: Date.now() }; }

  snapshot() { return { playState: this.st.playState, currentTime: this.now(), videoId: this.st.videoId }; }

  /** Validates and applies a playback action. Returns false if the payload is invalid. */
  apply(a: Action, p: { time?: number; videoId?: string } = {}): boolean {
    const t = typeof p.time === 'number' && isFinite(p.time) && p.time >= 0 ? p.time : undefined;
    switch (a) {
      case 'play': this.set('playing', t ?? this.now()); return true;
      case 'pause': this.set('paused', t ?? this.now()); return true;
      case 'seek': if (t === undefined) return false; this.set(this.st.playState, t); return true;
      case 'change_video':
        if (!p.videoId || !VIDEO_ID.test(p.videoId)) return false;
        this.st.videoId = p.videoId; this.set('playing', 0); return true;
    }
  }

  addRequest(p: Participant, type: Action, payload: ChangeRequest['payload']): ChangeRequest | null {
    if (this.requests.length >= 20) return null;
    const r = { id: `${this.id}-${++this.reqSeq}`, userId: p.id, username: p.username, type, payload };
    this.requests.push(r);
    return r;
  }
  takeRequest(id: string) {
    const r = this.requests.find(x => x.id === id);
    if (r) this.requests = this.requests.filter(x => x !== r);
    return r;
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  all() { return this.rooms.values(); }
  get(id: string) { return this.rooms.get(id); }
  create() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    do { id = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (this.rooms.has(id));
    const r = new Room(id);
    this.rooms.set(id, r);
    return r;
  }
  remove(id: string) { this.rooms.delete(id); }
}
