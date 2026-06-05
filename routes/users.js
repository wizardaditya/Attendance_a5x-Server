import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { departments } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { sendWelcomeEmail } from '../services/email.js';

const router = express.Router();

// ── List users ──────────────────────────────────────────────────────────────
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { department, search } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
    const users = await User.find(filter).select('-password').lean();
    const normalized = users.map(u => ({ ...u, id: u._id.toString(), _id: u._id.toString() }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.get('/departments', authMiddleware, (req, res) => res.json(departments));

// ── Cleanup inactive users from Atlas ───────────────────────────────────────
router.delete('/cleanup/inactive', authMiddleware, adminOnly, async (req, res) => {
  try {
    const inactiveUsers = await User.find({ isActive: false }, '_id').lean();
    const inactiveIds   = inactiveUsers.map(u => u._id);

    if (inactiveIds.length === 0)
      return res.json({ message: 'Nothing to clean up', usersDeleted: 0, attendanceOrphansDeleted: 0 });

    await User.deleteMany({ isActive: false });

    // Remove orphaned attendance records
    const Attendance = (await import('../models/Attendance.js')).default;
    const attendClean = await Attendance.deleteMany({ userId: { $in: inactiveIds } });

    // Remove from teams
    const Team = (await import('../models/Team.js')).default;
    for (const id of inactiveIds) {
      await Team.updateMany({ members: id }, { $pull: { members: id } });
    }

    res.json({
      message: 'Cleanup complete',
      usersDeleted: inactiveIds.length,
      attendanceOrphansDeleted: attendClean.deletedCount,
    });
  } catch (err) {
    console.error('Cleanup error:', err.message);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// ── Get single user ──────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.user.role === 'EMPLOYEE' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ error: 'Forbidden' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// ── Create user ──────────────────────────────────────────────────────────────
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, email, phone, department, designation, role } = req.body;
    if (!name || !email || !phone || !department)
      return res.status(400).json({ error: 'Name, email, phone, department required' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ error: 'Email already exists' });

    let employeeId, attempts = 0;
    while (attempts < 10) {
      const empCount = await User.countDocuments();
      employeeId = `A5X-${String(empCount + 1 + attempts).padStart(3, '0')}`;
      const exists = await User.findOne({ employeeId });
      if (!exists) break;
      attempts++;
    }

    const user = await User.create({
      name, email: email.toLowerCase(), phone,
      password:    await bcrypt.hash('Welcome@123', 10),
      role:        role || 'EMPLOYEE',
      department,
      designation: designation || (role === 'FOUNDER' ? 'Co-Founder' : 'Employee'),
      employeeId,
      isActive:    true,
    });
    const { password: _, ...safeUser } = user.toObject();

    // Send welcome email (fire and forget)
    sendWelcomeEmail({
      name:        user.name,
      email:       user.email,
      employeeId:  user.employeeId,
      department:  user.department,
      designation: user.designation,
      role:        user.role,
    }).catch(e => console.error('Welcome email error:', e.message));

    res.status(201).json(safeUser);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ error: `${field} already exists` });
    }
    console.error('Create user error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ── Update user ──────────────────────────────────────────────────────────────
router.patch('/:id', authMiddleware, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.user.role === 'EMPLOYEE' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ error: 'Forbidden' });
    const { name, phone, department, designation, isActive, role, email } = req.body;
    if (name)        user.name        = name;
    if (phone)       user.phone       = phone;
    if (designation) user.designation = designation;
    if (department && req.user.role !== 'EMPLOYEE') user.department = department;
    if (typeof isActive === 'boolean' && req.user.role !== 'EMPLOYEE') user.isActive = isActive;
    if (role && req.user.role === 'ADMIN') user.role = role;
    if (email && req.user.role === 'ADMIN') user.email = email.toLowerCase();
    await user.save();
    const { password: _, ...safeUser } = user.toObject();
    res.json(safeUser);
  } catch (err) {
    console.error('Patch user error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── Delete user permanently ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user._id.toString() === req.user._id.toString())
      return res.status(403).json({ error: 'Cannot delete your own account' });
    await User.deleteOne({ _id: req.params.id });
    const Team = (await import('../models/Team.js')).default;
    await Team.updateMany({ members: req.params.id }, { $pull: { members: req.params.id } });
    res.json({ message: 'Employee deleted permanently' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// ── Reset password ───────────────────────────────────────────────────────────
router.post('/:id/reset-password', authMiddleware, adminOnly, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.password = await bcrypt.hash('Welcome@123', 10);
    await user.save();
    res.json({ message: 'Password reset to Welcome@123' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
