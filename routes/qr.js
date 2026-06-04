import express from 'express';
import QRCode_lib from 'qrcode';
import QRCode from '../models/QRCode.js';
import { authMiddleware, adminOnly, generateQRToken, verifyQRToken } from '../middleware/auth.js';

const router = express.Router();
const CLIENT_URL = () =>
  (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();

// List QRs - only active ones (expired/deleted are gone)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Auto-delete any expired QRs first
    await QRCode.deleteMany({ expiresAt: { $lt: new Date() } });
    const codes = await QRCode.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load QR codes' });
  }
});

// Generate manual QR - only ONE active per type (CHECKIN/CHECKOUT/MANUAL) at a time
router.post('/generate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { location, department, type } = req.body;
    if (!location) return res.status(400).json({ error: 'Location required' });

    const qrType = (type || 'MANUAL').toUpperCase();

    // Delete ALL existing QRs of same type (not just deactivate - hard delete)
    await QRCode.deleteMany({ type: qrType, isAuto: false });

    // Also delete any expired QRs while we're at it
    await QRCode.deleteMany({ expiresAt: { $lt: new Date() } });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const qr = await QRCode.create({
      location,
      department: department || 'All',
      type:       qrType,
      isAuto:     false,
      isActive:   true,
      createdBy:  req.user._id,
      expiresAt,
    });

    const token     = generateQRToken(qr._id.toString(), location);
    const url       = `${CLIENT_URL()}/checkin?token=${token}&type=${qrType.toLowerCase()}`;
    const qrDataUrl = await QRCode_lib.toDataURL(url, {
      width: 400, margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    qr.token     = token;
    qr.url       = url;
    qr.qrDataUrl = qrDataUrl;
    await qr.save();

    res.json(qr);
  } catch (err) {
    console.error('Generate QR error:', err.message);
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

// Regenerate - refresh token, reset expiry
router.post('/regenerate/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const qr = await QRCode.findById(req.params.id);
    if (!qr) return res.status(404).json({ error: 'QR not found' });

    const token     = generateQRToken(qr._id.toString(), qr.location);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const url       = `${CLIENT_URL()}/checkin?token=${token}&type=${(qr.type || 'manual').toLowerCase()}`;
    const qrDataUrl = await QRCode_lib.toDataURL(url, { width: 400, margin: 2 });

    Object.assign(qr, { token, url, qrDataUrl, expiresAt, isActive: true, scanCount: 0 });
    await qr.save();
    res.json(qr);
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate QR' });
  }
});

// Deactivate (keep record but mark inactive)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const qr = await QRCode.findById(req.params.id);
    if (!qr) return res.status(404).json({ error: 'QR not found' });
    qr.isActive = false;
    await qr.save();
    res.json({ message: 'QR deactivated', qr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate QR' });
  }
});

// Permanently delete QR
router.delete('/:id/permanent', authMiddleware, adminOnly, async (req, res) => {
  try {
    await QRCode.deleteOne({ _id: req.params.id });
    res.json({ message: 'QR permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete QR' });
  }
});

// Validate QR token
router.post('/validate', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const decoded = verifyQRToken(token);
    if (decoded.type !== 'QR_CHECKIN') return res.status(400).json({ error: 'Invalid QR type' });
    const qr = await QRCode.findOne({ _id: decoded.qrId, isActive: true });
    if (!qr) return res.status(400).json({ error: 'QR code expired or invalid' });
    if (new Date() > new Date(qr.expiresAt)) {
      // Auto-delete expired QR
      await QRCode.deleteOne({ _id: qr._id });
      return res.status(400).json({ error: 'QR code has expired' });
    }
    res.json({ valid: true, location: decoded.location, qrId: decoded.qrId });
  } catch {
    res.status(400).json({ error: 'Invalid or expired QR token' });
  }
});

export default router;
