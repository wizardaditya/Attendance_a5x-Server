import express from 'express';
import QRCode from 'qrcode';
import { db, generateId, logAudit } from '../db.js';
import { authMiddleware, adminOnly, generateQRToken, verifyQRToken } from '../middleware/auth.js';

const router = express.Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

router.get('/', authMiddleware, adminOnly, (req, res) => res.json(db.qrCodes));

router.post('/generate', authMiddleware, adminOnly, async (req, res) => {
  const { location, department } = req.body;
  if (!location) return res.status(400).json({ error:'Location required' });
  db.qrCodes.forEach(q => { if (q.location === location) q.isActive = false; });
  const id = generateId();
  const token = generateQRToken(id, location);
  const expiresAt = new Date(Date.now() + 24*60*60*1000);
  const url = `${CLIENT_URL}/checkin?token=${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width:400, margin:2, color:{ dark:'#000000', light:'#FFFFFF' } });
  const entry = { id, location, department:department||'All', token, url, qrDataUrl, expiresAt, isActive:true, createdBy:req.user.id, scanCount:0, createdAt:new Date() };
  db.qrCodes.push(entry);
  logAudit(req.user.id, 'QR_GENERATED', { location, id });
  res.json(entry);
});

router.post('/regenerate/:id', authMiddleware, adminOnly, async (req, res) => {
  const qr = db.qrCodes.find(q => q.id === req.params.id);
  if (!qr) return res.status(404).json({ error:'QR not found' });
  const token = generateQRToken(qr.id, qr.location);
  const expiresAt = new Date(Date.now() + 24*60*60*1000);
  const url = `${CLIENT_URL}/checkin?token=${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width:400, margin:2 });
  Object.assign(qr, { token, url, qrDataUrl, expiresAt, isActive:true, scanCount:0 });
  logAudit(req.user.id, 'QR_REGENERATED', { id:qr.id });
  res.json(qr);
});

router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const qr = db.qrCodes.find(q => q.id === req.params.id);
  if (!qr) return res.status(404).json({ error:'QR not found' });
  qr.isActive = false;
  logAudit(req.user.id, 'QR_INVALIDATED', { id:qr.id });
  res.json({ message:'QR invalidated' });
});

router.post('/validate', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error:'Token required' });
  try {
    const decoded = verifyQRToken(token);
    if (decoded.type !== 'QR_CHECKIN') return res.status(400).json({ error:'Invalid QR type' });
    const qr = db.qrCodes.find(q => q.id === decoded.qrId && q.isActive);
    if (!qr) return res.status(400).json({ error:'QR code expired or invalid' });
    if (new Date() > new Date(qr.expiresAt)) { qr.isActive = false; return res.status(400).json({ error:'QR code has expired' }); }
    res.json({ valid:true, location:decoded.location, qrId:decoded.qrId });
  } catch { res.status(400).json({ error:'Invalid or expired QR token' }); }
});

export default router;
