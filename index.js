import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './db.js';

dotenv.config();
connectDB();

import authRoutes        from './routes/auth.js';
import qrRoutes          from './routes/qr.js';
import attendanceRoutes  from './routes/attendance.js';
import userRoutes        from './routes/users.js';
import taskRoutes        from './routes/tasks.js';
import announcementRoutes from './routes/announcements.js';

const app = express();
const httpServer = createServer(app);

const RAW_ORIGINS = process.env.CLIENT_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = RAW_ORIGINS.split(',').map(o => o.trim());

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});
app.set('io', io);

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const checkinLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use('/api/auth',          authRoutes);
app.use('/api/qr',            qrRoutes);
app.use('/api/attendance',    checkinLimiter, attendanceRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/tasks',         taskRoutes);
app.use('/api/announcements', announcementRoutes);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', app: 'WorkSyne by A5X Industries', time: new Date() })
);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 WorkSyne Server → http://localhost:${PORT}\n`);
});
