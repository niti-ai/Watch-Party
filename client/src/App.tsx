import { useEffect, useState } from 'react';
import { socket } from './socket';
import { JoinInfo } from './types';
import RoomView from './RoomView';
import { Logo } from './RoomView';

const ADJ = ['Sleepy', 'Cosmic', 'Sneaky', 'Cheerful', 'Popcorn', 'Midnight', 'Zesty', 'Cozy'];
const ANI = ['Otter', 'Panda', 'Falcon', 'Llama', 'Fox', 'Koala', 'Gecko', 'Owl'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export default function App() {
  const invite = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase();
  const [name, setName] = useState('');
  const [code, setCode] = useState(invite);
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(socket.connected);

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    socket.on('connect', up); socket.on('disconnect', down);
    return () => { socket.off('connect', up); socket.off('disconnect', down); };
  }, []);

  const invited = invite.length === 6 && code === invite;
  const ready = !!name.trim() && !busy;
  const go = (event: 'create_room' | 'join_room') => {
    if (!ready || (event === 'join_room' && code.length < 6)) return;
    setMsg(''); setBusy(true);
    socket.emit(event, { username: name, roomId: code }, (r: any) => {
      setBusy(false);
      if (!r.ok) return setMsg(r.error);
      history.replaceState(null, '', `?room=${r.roomId}`);
      setInfo(r);
    });
  };

  if (info) return <RoomView info={info} onExit={m => { setInfo(null); setMsg(m); history.replaceState(null, '', '/'); }} />;

  return (
    <div className="home">
      <nav className="top"><Logo /></nav>
      <main className="hero">
        <h1>Watch YouTube together.</h1>
        <p className="sub">Create a room, share the link, and play videos in sync with friends. Chat and react as you watch.</p>
        <div className="card">
          {invited && <p className="invite">You’re invited to room <b>{invite}</b></p>}
          <input aria-label="Your name" autoFocus value={name} maxLength={24} placeholder="Your name"
            onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go(invited ? 'join_room' : 'create_room')} />
          <button className="link" onClick={() => setName(`${pick(ADJ)} ${pick(ANI)}`)}>Pick a random name</button>
          {invited ? (
            <>
              <button className="primary big" disabled={!ready} onClick={() => go('join_room')}>{busy ? 'Joining…' : 'Join room'}</button>
              <button className="link" onClick={() => { setCode(''); history.replaceState(null, '', '/'); }}>Create my own room instead</button>
            </>
          ) : (
            <>
              <button className="primary big" disabled={!ready} onClick={() => go('create_room')}>{busy ? 'Creating…' : 'Create a room'}</button>
              <div className="or">or join an existing room</div>
              <div className="row">
                <input aria-label="Room code" className="codein" value={code} maxLength={6} placeholder="Room code"
                  onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} onKeyDown={e => e.key === 'Enter' && go('join_room')} />
                <button disabled={!ready || code.length < 6} onClick={() => go('join_room')}>Join</button>
              </div>
            </>
          )}
          {!name.trim() && <p className="hint">Enter a name to continue.</p>}
          {!online && <p className="warn">Waking up the server. The first visit can take up to a minute.</p>}
          {msg && <p className="err">{msg}</p>}
        </div>
        <div className="feats">
          <div><h3>Always in sync</h3><p>Play, pause, seek and video changes reach everyone instantly.</p></div>
          <div><h3>You choose who’s in control</h3><p>The host can make moderators, remove people, or hand over the host role.</p></div>
          <div><h3>Chat and react</h3><p>Talk it over and send reactions that float over the video.</p></div>
        </div>
      </main>
    </div>
  );
}
