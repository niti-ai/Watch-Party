import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import Player from './Player';
import { Action, ChangeRequest, JoinInfo, Line, Person, PlayerState, Role } from './types';

const label: Record<Action, string> = { play: 'play', pause: 'pause', seek: 'seek', change_video: 'change the video' };
const EMOJI = ['🔥', '😂', '😮', '❤️', '👏'];
const hue = (s: string) => [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 360;
const mmss = (t = 0) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const Avatar = ({ name }: { name: string }) => (
  <span className="avatar" style={{ background: `hsl(${hue(name)} 70% 62%)` }}>{name[0]?.toUpperCase()}</span>
);
export const Logo = () => <span className="logo"><i />WatchParty</span>;

export default function RoomView({ info, onExit }: { info: JoinInfo; onExit: (msg: string) => void }) {
  const [people, setPeople] = useState<Person[]>(info.participants);
  const [state, setState] = useState<PlayerState>(info.state);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [floaters, setFloaters] = useState<{ id: number; emoji: string; x: number; who: string }[]>([]);
  const [tab, setTab] = useState<'chat' | 'people' | 'requests'>('chat');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState('');
  const log = useRef<HTMLDivElement>(null);

  const me = people.find(p => p.userId === info.userId);
  const role: Role = me?.role ?? 'participant';
  const canControl = role !== 'participant';
  const sys = (t: string) => setLines(l => [...l, { kind: 'system', text: t }]);

  useEffect(() => {
    const on: Record<string, (d: any) => void> = {
      user_joined: d => { setPeople(d.participants); sys(`${d.username} joined the room`); },
      user_left: d => { setPeople(d.participants); sys(`${d.username} left the room`); },
      role_assigned: d => { setPeople(d.participants); sys(`${d.username} is now a ${d.role}`); },
      host_transferred: d => { setPeople(d.participants); sys(`${d.username} is now the host`); },
      participant_removed: d => { setPeople(d.participants); sys(`${d.username} was removed`); },
      sync_state: setState,
      requests_updated: d => setRequests(d.requests),
      request_sent: () => sys('Request sent. Waiting for the host or a moderator.'),
      request_resolved: d => sys(`${d.by} ${d.approved ? 'approved' : 'declined'} ${d.username}’s request to ${label[d.type as Action]}`),
      chat_message: d => setLines(l => [...l, { kind: 'chat', text: d.text, userId: d.userId, username: d.username, role: d.role, ts: d.ts }]),
      reaction: d => {
        const id = Date.now() + Math.random();
        setFloaters(f => [...f, { id, emoji: d.emoji, x: 8 + Math.random() * 80, who: d.username }]);
        setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 2600);
      },
      error_msg: d => sys(d.message),
      kicked: () => onExit('The host removed you from the room.'),
    };
    Object.entries(on).forEach(([e, f]) => socket.on(e, f));
    return () => { Object.entries(on).forEach(([e, f]) => socket.off(e, f)); };
  }, []);

  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [lines, tab]);

  // Controllers emit directly; participants raise a request for approval.
  const act = (type: Action, payload: object = {}) =>
    canControl ? socket.emit(type, payload) : socket.emit('request_change', { type, payload });

  const flash = (w: string) => { setCopied(w); setTimeout(() => setCopied(''), 1500); };
  const share = () => { navigator.clipboard?.writeText(`${location.origin}/?room=${info.roomId}`); flash('link'); };
  const copyCode = () => { navigator.clipboard?.writeText(info.roomId); flash('code'); };
  const leave = () => { socket.emit('leave_room'); onExit(''); };
  const send = () => { if (text.trim()) { socket.emit('chat', { text }); setText(''); } };
  const pending = canControl ? requests.length : 0;

  return (
    <div className="wp">
      <nav className="top">
        <Logo />
        <button className="pill" onClick={copyCode} title="Copy room code">Room {info.roomId} {copied === 'code' && '· copied'}</button>
        <span className={`chip ${role}`}>{role}</span>
        <span className="gap" />
        <button className="primary" onClick={share}>{copied === 'link' ? 'Link copied!' : 'Share'}</button>
        <button onClick={leave}>Leave</button>
      </nav>

      <div className="body">
        <div className="stagecol">
          <Player state={state} canControl={canControl} act={act}>
            {floaters.map(f => <span className="float" key={f.id} style={{ left: `${f.x}%` }}>{f.emoji}<small>{f.who}</small></span>)}
          </Player>
          <div className="reacts">
            {EMOJI.map(e => <button key={e} onClick={() => socket.emit('reaction', { emoji: e })}>{e}</button>)}
          </div>
        </div>

        <aside className="side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
            <button role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>People ({people.length})</button>
            {canControl && <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}>Requests{pending > 0 && <b className="badge">{pending}</b>}</button>}
          </div>

          {tab === 'chat' && (
            <>
              <div className="log" ref={log}>
                {lines.length === 0 && <p className="sys">No messages yet. Say hello!</p>}
                {lines.map((l, i) => l.kind === 'system'
                  ? <p key={i} className="sys">{l.text}</p>
                  : <div key={i} className="msg"><Avatar name={l.username ?? '?'} />
                      <div><b style={{ color: `hsl(${hue(l.username ?? '')} 80% 72%)` }}>{l.username}</b>
                        <time>{l.ts && new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                        <p>{l.text}</p></div></div>)}
              </div>
              <div className="row compose">
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message…" maxLength={300} />
                <button className="primary" onClick={send}>Send</button>
              </div>
            </>
          )}

          {tab === 'people' && (
            <div className="list">
              {people.map(p => (
                <div className="person" key={p.userId}>
                  <Avatar name={p.username} />
                  <span className="pname">{p.username}{p.userId === info.userId && ' (you)'}</span>
                  <span className={`chip ${p.role}`}>{p.role}</span>
                  {role === 'host' && p.userId !== info.userId && (
                    <span className="actions">
                      <select aria-label={`Role for ${p.username}`} value={p.role} onChange={e => socket.emit('assign_role', { userId: p.userId, role: e.target.value })}>
                        <option value="participant">participant</option>
                        <option value="moderator">moderator</option>
                      </select>
                      <button onClick={() => socket.emit('transfer_host', { userId: p.userId })}>Make host</button>
                      <button className="danger" onClick={() => socket.emit('remove_participant', { userId: p.userId })}>Remove</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'requests' && (
            <div className="list">
              {requests.length === 0 && <p className="sys">No pending requests.</p>}
              {requests.map(r => (
                <div className="person" key={r.id}>
                  <Avatar name={r.username} />
                  <span className="pname"><b>{r.username}</b> wants to {label[r.type]}
                    {r.type === 'seek' && ` to ${mmss(r.payload.time)}`}{r.type === 'change_video' && ` (${r.payload.videoId})`}</span>
                  <span className="actions">
                    <button className="primary" onClick={() => socket.emit('resolve_request', { requestId: r.id, approve: true })}>Approve</button>
                    <button onClick={() => socket.emit('resolve_request', { requestId: r.id, approve: false })}>Decline</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
