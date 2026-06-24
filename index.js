import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import { startQRScheduler } from './scheduler.js';

dotenv.config();
connectDB();

import authRoutes        from './routes/auth.js';
import qrRoutes          from './routes/qr.js';
import attendanceRoutes  from './routes/attendance.js';
import userRoutes        from './routes/users.js';
import taskRoutes        from './routes/tasks.js';
import announcementRoutes from './routes/announcements.js';
import settingsRoutes    from './routes/settings.js';
import teamRoutes        from './routes/teams.js';
import founderRoutes     from './routes/founder.js';
import pushRoutes        from './routes/push.js';

const app = express();
const httpServer = createServer(app);

// Trust Render/Vercel reverse proxy - required for rate limiting & IP detection
app.set('trust proxy', 1);

const RAW_ORIGINS = process.env.CLIENT_URL || 'http://localhost:5173';
const STATIC_ORIGINS = [
  ...RAW_ORIGINS.split(',').map(o => o.trim().replace(/\/$/, '')), // strip trailing slash
  'https://attendance-a5x-client.vercel.app',
  'http://localhost:5173',
];

// Dynamic origin check - allows all *.vercel.app preview deployments for this project
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow server-to-server
  if (STATIC_ORIGINS.includes(origin)) return true;
  // Allow all Vercel preview deployments for this project
  if (/^https:\/\/attendance-a5x-client.*\.vercel\.app$/.test(origin)) return true;
  // Allow wizardadityas-projects.vercel.app preview URLs
  if (/^https:\/\/attendance-a5x-client.*wizardadityas.*\.vercel\.app$/.test(origin)) return true;
  // Allow all vercel.app preview URLs for wizardadityas
  if (/^https:\/\/.*wizardadityas.*\.vercel\.app$/.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

console.log('Static Allowed Origins:', STATIC_ORIGINS);

const io = new Server(httpServer, {
  cors: corsOptions,
});
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});
app.set('io', io);

// Handle preflight for all routes
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const checkinLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use('/api/auth',          authRoutes);
app.use('/api/qr',            qrRoutes);
app.use('/api/attendance',    checkinLimiter, attendanceRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/tasks',         taskRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/teams',         teamRoutes);
app.use('/api/founder',       founderRoutes);
app.use('/api/push',          pushRoutes);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', app: 'WorkSyne by A5X Industries', time: new Date() })
);

// ── Test email route (admin only via query param) ──────────────────────────
app.get('/api/test-email', async (req, res) => {
  const { to } = req.query;
  if (!to) return res.status(400).json({ error: 'Pass ?to=youremail@gmail.com' });
  try {
    const { sendWelcomeEmail } = await import('./services/email.js');
    await sendWelcomeEmail({
      name: 'Test User', email: to, employeeId: 'A5X-TEST',
      department: 'Engineering', designation: 'Tester', role: 'EMPLOYEE',
    });
    res.json({ success: true, message: `Test email sent to ${to}`, emailUser: process.env.EMAIL_USER });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 WorkSyne Server → http://localhost:${PORT}\n`);
  console.log(`📧 Email config: Brevo API=${process.env.BREVO_API_KEY ? '✅ SET' : '❌ NOT SET'}`);

  // Start QR auto-scheduler
  startQRScheduler(io);

  // Keep-alive ping every 14 minutes to prevent Render free tier sleep
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      const res = await fetch(`${SELF_URL}/api/health`);
      console.log(`💓 Keep-alive ping: ${res.status}`);
    } catch (e) {
      console.warn('💓 Keep-alive ping failed:', e.message);
    }
  }, 14 * 60 * 1000); // every 14 minutes
});
