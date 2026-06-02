import express from 'express';
import { db, generateId } from '../db.js';
import { authMiddleware, adminOnly, verifyQRToken } from '../middleware/auth.js';

const router = express.Router();
const todayStr = () => new Date().toISOString().split('T')[0];

router.post('/checkin', authMiddleware, async (req, res) => {
  const { token, latitude, longitude, deviceId } = req.body;
  if (!token) return res.status(400).json({ error:'QR token required' });
  let qrData;
  try { qrData = verifyQRToken(token); if (qrData.type !== 'QR_CHECKIN') throw new Error(); }
  catch { return res.status(400).json({ error:'Invalid or expired QR code' }); }
  const qr = db.qrCodes.find(q => q.id === qrData.qrId && q.isActive);
  if (!qr) return res.status(400).json({ error:'QR code is no longer active' });
  const today = todayStr();
  const existing = db.attendance.find(a => a.userId === req.user.id && a.date === today);
  if (existing?.checkIn) {
    if (!existing.checkOut) return res.status(409).json({ error:'Already checked in today', attendance:existing, alreadyCheckedIn:true });
    return res.status(409).json({ error:'Already completed attendance for today' });
  }
  const now = new Date();
  const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 30);
  const record = { id:generateId(), userId:req.user.id, userName:req.user.name, userPhone:req.user.phone, department:req.user.department, date:today, checkIn:now, checkOut:null, duration:null, status:isLate?'LATE':'PRESENT', location:qrData.location, latitude:latitude||null, longitude:longitude||null, deviceId:deviceId||null, flagged:false, qrId:qrData.qrId };
  db.attendance.push(record);
  qr.scanCount += 1;
  if (req.app.get('io')) req.app.get('io').emit('attendance:checkin', { ...record, user:{ name:req.user.name, avatar:req.user.avatar, department:req.user.department } });
  res.json({ message:'Check-in successful', attendance:record });
});

router.post('/checkout', authMiddleware, (req, res) => {
  const today = todayStr();
  const record = db.attendance.find(a => a.userId === req.user.id && a.date === today && !a.checkOut);
  if (!record) return res.status(404).json({ error:'No active check-in found for today' });
  const now = new Date();
  record.checkOut = now;
  record.duration = Math.round((now - new Date(record.checkIn)) / 60000);
  if (req.app.get('io')) req.app.get('io').emit('attendance:checkout', { userId:req.user.id, checkOut:now });
  res.json({ message:'Check-out successful', attendance:record });
});

router.get('/today', authMiddleware, (req, res) => {
  const record = db.attendance.find(a => a.userId === req.user.id && a.date === todayStr());
  res.json(record || null);
});

router.get('/my', authMiddleware, (req, res) => {
  const { from, to } = req.query;
  let records = db.attendance.filter(a => a.userId === req.user.id);
  if (from) records = records.filter(a => a.date >= from);
  if (to) records = records.filter(a => a.date <= to);
  res.json(records.sort((a,b) => new Date(b.date) - new Date(a.date)));
});

router.get('/all', authMiddleware, adminOnly, (req, res) => {
  const { date, department, status, from, to } = req.query;
  let records = [...db.attendance];
  if (date) records = records.filter(a => a.date === date);
  if (department) records = records.filter(a => a.department === department);
  if (status) records = records.filter(a => a.status === status);
  if (from) records = records.filter(a => a.date >= from);
  if (to) records = records.filter(a => a.date <= to);
  res.json(records.sort((a,b) => new Date(b.checkIn) - new Date(a.checkIn)));
});

router.get('/live', authMiddleware, adminOnly, (req, res) => {
  const today = todayStr();
  const records = db.attendance.filter(a => a.date === today).map(a => {
    const user = db.users.find(u => u.id === a.userId);
    return { ...a, user: user ? { name:user.name, avatar:user.avatar, department:user.department } : null };
  }).sort((a,b) => new Date(b.checkIn) - new Date(a.checkIn));
  res.json(records);
});

router.get('/stats', authMiddleware, adminOnly, (req, res) => {
  const today = todayStr();
  const totalEmployees = db.users.filter(u => u.role === 'EMPLOYEE' && u.isActive).length;
  const todayRecords = db.attendance.filter(a => a.date === today);
  const present = todayRecords.filter(a => a.status === 'PRESENT').length;
  const late = todayRecords.filter(a => a.status === 'LATE').length;
  const checkedIn = todayRecords.filter(a => a.checkIn).length;
  res.json({ totalEmployees, present, late, absent:totalEmployees - checkedIn, checkedIn, date:today });
});

router.patch('/:id', authMiddleware, adminOnly, (req, res) => {
  const record = db.attendance.find(a => a.id === req.params.id);
  if (!record) return res.status(404).json({ error:'Record not found' });
  const { checkIn, checkOut, status } = req.body;
  if (checkIn) record.checkIn = new Date(checkIn);
  if (checkOut) { record.checkOut = new Date(checkOut); record.duration = Math.round((new Date(checkOut) - new Date(record.checkIn)) / 60000); }
  if (status) record.status = status;
  res.json(record);
});

export default router;
