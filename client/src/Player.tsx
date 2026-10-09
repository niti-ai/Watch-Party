import { useEffect, useRef, useState } from 'react';
import { Action, PlayerState, parseVideoId } from './types';

declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void } }

function loadYT(): Promise<void> {
  return new Promise(res => {
    if (window.YT?.Player) return res();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
    if (!document.getElementById('yt-api')) {
      const s = document.createElement('script');
      s.id = 'yt-api'; s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

interface Props {
  state: PlayerState;
  canControl: boolean;
  act: (type: Action, payload?: { time?: number; videoId?: string }) => void;
  children?: React.ReactNode;
}

export default function Player({ state, canControl, act, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const yt = useRef<any>(null);
  const latest = useRef(state);
  const [ready, setReady] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [bad, setBad] = useState(false);
  latest.current = state;

  // Apply the room's state to the local player. Controls are hidden, so only the server drives playback.
  const apply = () => {
    const p = yt.current, s = latest.current;
    if (!p?.getVideoData) return;
    if (p.getVideoData().video_id !== s.videoId) {
      const args = { videoId: s.videoId, startSeconds: s.currentTime };
      return s.playState === 'playing' ? p.loadVideoById(args) : p.cueVideoById(args);
    }
    const drift = Math.abs(p.getCurrentTime() - s.currentTime);
    if (drift > (s.playState === 'playing' ? 1.5 : 0.3)) p.seekTo(s.currentTime, true);
    s.playState === 'playing' ? p.playVideo() : p.pauseVideo();
  };

  useEffect(() => {
    let dead = false;
    loadYT().then(() => {
      if (dead || !box.current) return;
      yt.current = new window.YT.Player(box.current, {
        width: '100%', height: '100%', videoId: latest.current.videoId,
        playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onReady: () => { setReady(true); apply(); } },
      });
    });
    return () => { dead = true; yt.current?.destroy?.(); };
  }, []);

  useEffect(() => { if (ready) apply(); }, [state, ready]);

  useEffect(() => {
    const t = setInterval(() => {
      const p = yt.current;
      if (!p?.getCurrentTime) return;
      setCur(p.getCurrentTime()); setDur(p.getDuration() || 0);
    }, 500);
    return () => clearInterval(t);
  }, []);

  const shown = scrub ?? cur;
  const submitUrl = () => {
    const id = parseVideoId(url);
    if (!id) return setBad(true);
    setBad(false); setUrl(''); act('change_video', { videoId: id });
  };

  return (
    <section className="player">
      <div className={`screen ${state.playState}`}><div ref={box} />{children}</div>
      <p className={`status ${state.playState}`}>{state.playState === 'playing' ? 'Playing for everyone' : 'Paused for everyone'}</p>
      <div className="controls">
        <button className="primary" onClick={() => act(state.playState === 'playing' ? 'pause' : 'play', { time: cur })}>
          {state.playState === 'playing' ? (canControl ? 'Pause' : 'Ask to pause') : (canControl ? 'Play' : 'Ask to play')}
        </button>
        <span className="time">{fmt(shown)}</span>
        <input type="range" min={0} max={dur || 1} step={1} value={shown}
          onChange={e => setScrub(Number(e.target.value))}
          onPointerUp={() => { if (scrub !== null) act('seek', { time: scrub }); setScrub(null); }} />
        <span className="time">{fmt(dur)}</span>
        <button onClick={apply} title="Re-sync to the room (also unblocks autoplay)">Sync me</button>
      </div>
      <div className="row">
        <input value={url} onChange={e => { setUrl(e.target.value); setBad(false); }} onKeyDown={e => e.key === 'Enter' && submitUrl()}
          placeholder="Paste a YouTube link" aria-invalid={bad} />
        <button onClick={submitUrl}>{canControl ? 'Change video' : 'Suggest video'}</button>
      </div>
      {bad && <p className="err">That doesn’t look like a YouTube link.</p>}
      {!canControl && <p className="hint">Your changes are sent to the host and moderators for approval.</p>}
    </section>
  );
}
