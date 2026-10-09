import { io } from 'socket.io-client';

// Same origin in production (server serves the client); Vite proxies /socket.io in dev.
export const socket = io(import.meta.env.VITE_SERVER_URL || undefined);
