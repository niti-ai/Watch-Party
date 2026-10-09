export type Role = 'host' | 'moderator' | 'participant';
export type Action = 'play' | 'pause' | 'seek' | 'change_video';
export interface Person { userId: string; username: string; role: Role }
export interface PlayerState { playState: 'playing' | 'paused'; currentTime: number; videoId: string }
export interface ChangeRequest { id: string; userId: string; username: string; type: Action; payload: { time?: number; videoId?: string } }
export interface JoinInfo { roomId: string; userId: string; participants: Person[]; state: PlayerState }
export interface Line { kind: 'chat' | 'system'; text: string; userId?: string; username?: string; role?: Role; ts?: number }

export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch { /* not a URL */ }
  return null;
}
