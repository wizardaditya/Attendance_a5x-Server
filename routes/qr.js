import express from 'express';
import QRCode_lib from 'qrcode';
import QRCode from '../models/QRCode.js';
import { authMiddleware, adminOnly, generateQRToken, verifyQRToken } from '../middleware/auth.js';

const router = express.Router();
const CLIENT_URL = process.env.CLIENT_URL?.split(',')[0].trim() || 'http://localhost:5173';

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const codes = await QRCode.find().sort({ createdAt: -1 });
  res.json(codes);
});

router.post('/generate', authMiddleware, adminOnly, async (req, res) => {
  const { location, department } = req.body;
  if (!location) return res.status(400).json({ error: 'Location required' });

  // Deactivate old QRs for this location
  await QRCode.updateMany({ location }, { isActive: false });

  const qr = await QRCode.create({
    location,
    department: department || 'All',
    isActive:   true,
    createdBy:  req.user._id,
    expiresAt:  new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const token     = generateQRToken(qr._id.toString(), location);
  const url       = `${CLIENT_URL}/checkin?token=${token}`;
  const qrDataUrl = await QRCode_lib.toDataURL(url, { width: 400, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });

  qr.token     = token;
  qr.url       = url;
  qr.qrDataUrl = qrDataUrl;
  await qr.save();

  res.json(qr);
});

router.post('/regenerate/:id', authMiddleware, adminOnly, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr) return res.status(404).json({ error: 'QR not found' });

  const token     = generateQRToken(qr._id.toString(), qr.location);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const url       = `${CLIENT_URL}/checkin?token=${token}`;
  const qrDataUrl = await QRCode_lib.toDataURL(url, { width: 400, margin: 2 });

  Object.assign(qr, { token, url, qrDataUrl, expiresAt, isActive: true, scanCount: 0 });
  await qr.save();
  res.json(qr);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr) return res.status(404).json({ error: 'QR not found' });
  qr.isActive = false;
  await qr.save();
  res.json({ message: 'QR invalidated' });
});

router.post('/validate', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const decoded = verifyQRToken(token);
    if (decoded.type !== 'QR_CHECKIN') return res.status(400).json({ error: 'Invalid QR type' });
    const qr = await QRCode.findOne({ _id: decoded.qrId, isActive: true });
    if (!qr) return res.status(400).json({ error: 'QR code expired or invalid' });
    if (new Date() > new Date(qr.expiresAt)) {
      qr.isActive = false;
      await qr.save();
      return res.status(400).json({ error: 'QR code has expired' });
    }
    res.json({ valid: true, location: decoded.location, qrId: decoded.qrId });
  } catch {
    res.status(400).json({ error: 'Invalid or expired QR token' });
  }
});

export default router;
