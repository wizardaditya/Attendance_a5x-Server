import jwt from 'jsonwebtoken';
import { db } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'a5x-worksyne-super-secret-key-2024';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error:'Unauthorized' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    const user = db.users.find(u => u.id === decoded.id);
    if (!user || !user.isActive) return res.status(401).json({ error:'Invalid user' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error:'Invalid token' }); }
}

export function adminOnly(req, res, next) {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') return res.status(403).json({ error:'Admin access required' });
  next();
}

export const generateToken = (user) =>
  jwt.sign({ id:user.id, email:user.email, role:user.role }, JWT_SECRET, { expiresIn:'7d' });

export const generateQRToken = (qrId, location) =>
  jwt.sign({ qrId, location, type:'QR_CHECKIN' }, JWT_SECRET, { expiresIn:'24h' });

export const verifyQRToken = (token) => jwt.verify(token, JWT_SECRET);
