# Watch Party

Watch YouTube videos in sync with other people. Real-time sync over WebSockets (Socket.IO), room codes/links, and role-based control (Host, Moderator, Participant).

**Live URL:** https://watch-party-k9el.onrender.com

## Stack
- Frontend: React + TypeScript + Vite, YouTube IFrame API
- Backend: Node.js + Express + Socket.IO (TypeScript)
- Storage: in-memory rooms (the DB is optional in the brief)

## Run locally
```bash
# terminal 1
cd server && npm install && npm run dev      # http://localhost:3001
# terminal 2
cd client && npm install && npm run dev      # http://localhost:5173 (proxies /socket.io to :3001)
```
Open two browser windows: create a room in one, join with the code in the other.

## Production build (single service)
```bash
npm run build && npm start     # server serves client/dist on $PORT (default 3001)
```

## Deploy on Render
1. Push this repo to GitHub. 2. In Render choose **New > Blueprint** (uses `render.yaml`) or **New > Web Service** with build command `npm run build` and start command `npm start`. 3. Node 20. No env vars required. 4. Put the URL above.
Notes: the build installs devDependencies explicitly (`--include=dev`) because Render sets `NODE_ENV=production`. Free instances sleep when idle and rooms live in memory, so a restart clears them.

## Roles
| Role | Can do |
|---|---|
| Host (room creator) | Everything: play/pause, seek, change video, assign roles, remove people, transfer host, approve requests |
| Moderator (assigned by host) | Play/pause, seek, change video, approve or decline participant requests |
| Participant (default) | Watch, chat, and **request** changes; nothing happens until a host/moderator approves |

If the host leaves, the oldest moderator (else oldest participant) becomes host.

## Architecture
```
Browser (React) ──Socket.IO──> Express + Socket.IO server
   YouTube IFrame player            MessageHandler  (event routing + permission checks)
   (controls hidden; driven          RoomManager / Room / Participant  (state, roles, requests)
    only by sync_state)
```
- **Server is the source of truth.** Each `Room` keeps `{playState, time, videoId, updatedAt}`; current time is computed from the elapsed clock while playing.
- **Flow:** controller emits `play | pause | seek | change_video` -> `MessageHandler` checks `participant.canControl` -> `Room.apply()` validates -> server broadcasts `sync_state` to the Socket.IO room -> every client seeks/plays/pauses its player. The server re-broadcasts every 5 s while playing, and clients only seek when drift exceeds 1.5 s.
- **Permissions are enforced only on the server.** The UI hides or relabels controls, but a forged `change_video` from a Participant gets an `error_msg`.
- **Approval flow:** participant `request_change` -> pending list pushed only to host/mods (`requests_updated`) -> `resolve_request` approve applies the change and broadcasts `sync_state`; everyone sees `request_resolved`.
- **Events:** `create_room`, `join_room`, `leave_room`, `play`, `pause`, `seek`, `change_video`, `assign_role`, `remove_participant`, `transfer_host`, `request_change`, `resolve_request`, `chat` (client to server); `sync_state`, `user_joined`, `user_left`, `role_assigned`, `participant_removed`, `host_transferred`, `requests_updated`, `request_resolved`, `chat_message`, `kicked`, `error_msg` (server to client).

## Trade-offs
- In-memory rooms keep it simple; scaling out would need the Socket.IO Redis adapter and a shared store.
- Identity is the socket id, so a refresh joins as a new participant.
- Some browsers block autoplay with sound; the **Sync me** button is a user gesture that fixes it.
