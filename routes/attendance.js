import express from 'express';
import Attendance from '../models/Attendance.js';
import QRCode    from '../models/QRCode.js';
import User      from '../models/User.js';
import Settings  from '../models/Settings.js';
import { authMiddleware, adminOnly, verifyQRToken } from '../middleware/auth.js';

const router = express.Router();
const todayStr = () => new Date().toISOString().split('T')[0];

// Helper: check if checkin time is late based on settings
async function isLateCheckin(now) {
  const settings = await Settings.findOne();
  const startTime  = settings?.startTime  || '09:00';
  const gracePeriod = settings?.gracePeriod ?? 30;
  const [startH, startM] = startTime.split(':').map(Number);
  const deadlineMinutes = startH * 60 + startM + gracePeriod;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > deadlineMinutes;
}

router.post('/checkin', authMiddleware, async (req, res) => {
  const { token, latitude, longitude, deviceId } = req.body;
  if (!token) return res.status(400).json({ error: 'QR token required' });

  let qrData;
  try {
    qrData = verifyQRToken(token);
    if (qrData.type !== 'QR_CHECKIN') throw new Error();
  } catch { return res.status(400).json({ error: 'Invalid or expired QR code' }); }

  const qr = await QRCode.findById(qrData.qrId);
  if (!qr || !qr.isActive) return res.status(400).json({ error: 'QR code is no longer active' });

  const today = todayStr();
  const existing = await Attendance.findOne({ userId: req.user._id, date: today });

  if (existing?.checkIn) {
    if (!existing.checkOut)
      return res.status(409).json({ error: 'Already checked in today', attendance: existing, alreadyCheckedIn: true });
    return res.status(409).json({ error: 'Already completed attendance for today' });
  }

  const now = new Date();
  const late = await isLateCheckin(now);

  const record = await Attendance.create({
    userId:     req.user._id,
    userName:   req.user.name,
    userPhone:  req.user.phone,
    department: req.user.department,
    date:       today,
    checkIn:    now,
    status:     late ? 'LATE' : 'PRESENT',
    location:   qrData.location,
    latitude:   latitude || null,
    longitude:  longitude || null,
    deviceId:   deviceId || null,
    qrId:       qrData.qrId,
  });

  qr.scanCount += 1;
  await qr.save();

  if (req.app.get('io'))
    req.app.get('io').emit('attendance:checkin', {
      ...record.toObject(),
      user: { name: req.user.name, avatar: req.user.avatar, department: req.user.department },
    });

  res.json({ message: 'Check-in successful', attendance: record });
});

router.post('/checkout', authMiddleware, async (req, res) => {
  const record = await Attendance.findOne({ userId: req.user._id, date: todayStr(), checkOut: null });
  if (!record) return res.status(404).json({ error: 'No active check-in found for today' });

  const now = new Date();
  record.checkOut = now;
  record.duration = Math.round((now - new Date(record.checkIn)) / 60000);
  await record.save();

  if (req.app.get('io'))
    req.app.get('io').emit('attendance:checkout', { userId: req.user._id, checkOut: now });

  res.json({ message: 'Check-out successful', attendance: record });
});

router.get('/today', authMiddleware, async (req, res) => {
  const record = await Attendance.findOne({ userId: req.user._id, date: todayStr() });
  res.json(record || null);
});

router.get('/my', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  const filter = { userId: req.user._id };
  if (from || to) filter.date = {};
  if (from) filter.date.$gte = from;
  if (to)   filter.date.$lte = to;
  const records = await Attendance.find(filter).sort({ date: -1 });
  res.json(records);
});

router.get('/all', authMiddleware, adminOnly, async (req, res) => {
  const { date, department, status, from, to } = req.query;
  const filter = {};
  if (date)       filter.date = date;
  if (department) filter.department = department;
  if (status)     filter.status = status;
  if (from || to) { filter.date = filter.date || {}; }
  if (from && !date) filter.date = { ...filter.date, $gte: from };
  if (to   && !date) filter.date = { ...filter.date, $lte: to };
  const records = await Attendance.find(filter).sort({ checkIn: -1 }).lean();
  const normalized = records.map(r => ({ ...r, id: r._id.toString(), _id: r._id.toString() }));
  res.json(normalized);
});

router.get('/live', authMiddleware, adminOnly, async (req, res) => {
  const records = await Attendance.find({ date: todayStr() })
    .populate('userId', 'name avatar department')
    .sort({ checkIn: -1 });
  const enriched = records.map(r => ({
    ...r.toObject(),
    user: r.userId ? { name: r.userId.name, avatar: r.userId.avatar, department: r.userId.department } : null,
  }));
  res.json(enriched);
});

router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  const today = todayStr();
  const totalEmployees = await User.countDocuments({ role: 'EMPLOYEE', isActive: true });
  const todayRecords   = await Attendance.find({ date: today });
  const present  = todayRecords.filter(a => a.status === 'PRESENT').length;
  const late     = todayRecords.filter(a => a.status === 'LATE').length;
  const checkedIn = todayRecords.filter(a => a.checkIn).length;
  res.json({ totalEmployees, present, late, absent: totalEmployees - checkedIn, checkedIn, date: today });
});

router.patch('/:id', authMiddleware, adminOnly, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid record ID' });
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const { checkIn, checkOut, status } = req.body;

    // checkIn/checkOut come as "HH:MM" time string from frontend - combine with record date
    if (checkIn) {
      const [h, m] = checkIn.split(':');
      const d = new Date(`${record.date}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`);
      record.checkIn = d;
    }
    if (checkOut) {
      const [h, m] = checkOut.split(':');
      const d = new Date(`${record.date}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`);
      record.checkOut = d;
      if (record.checkIn) record.duration = Math.round((d - new Date(record.checkIn)) / 60000);
    }
    if (status) record.status = status;
    await record.save();
    const obj = record.toObject();
    res.json({ ...obj, id: obj._id.toString(), _id: obj._id.toString() });
  } catch (err) {
    console.error('Patch attendance error:', err.message);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

export default router;
