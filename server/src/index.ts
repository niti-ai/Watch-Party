import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { MessageHandler } from './handler';
import { RoomManager } from './room';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*' } });

new MessageHandler(io, new RoomManager()).start();

app.get('/health', (_q, r) => { r.json({ ok: true }); });
const dist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(dist));
app.get('*', (_q, r) => { r.sendFile(path.join(dist, 'index.html')); });

const port = Number(process.env.PORT) || 3001;
server.listen(port, () => console.log(`Watch Party listening on :${port}`));
