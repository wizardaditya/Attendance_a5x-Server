import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { departments } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const { department, search } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (search) filter.$or = [
    { name:  { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
  ];
  const users = await User.find(filter).select('-password').lean();
  // normalize: add id as string so frontend can use either emp.id or emp._id
  const normalized = users.map(u => ({ ...u, id: u._id.toString(), _id: u._id.toString() }));
  res.json(normalized);
});

router.get('/departments', authMiddleware, (req, res) => res.json(departments));

router.get('/:id', authMiddleware, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.user.role === 'EMPLOYEE' && req.user._id.toString() !== req.params.id)
    return res.status(403).json({ error: 'Forbidden' });
  res.json(user);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, email, phone, department, designation, role } = req.body;
    if (!name || !email || !phone || !department)
      return res.status(400).json({ error: 'Name, email, phone, department required' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ error: 'Email already exists' });

    // Generate unique employeeId with collision retry
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
      designation: designation || 'Employee',
      employeeId,
      isActive:    true,
    });
    const { password: _, ...safeUser } = user.toObject();
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

router.patch('/:id', authMiddleware, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.user.role === 'EMPLOYEE' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ error: 'Forbidden' });
    const { name, phone, department, designation, isActive, role } = req.body;
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (designation) user.designation = designation;
    if (department && req.user.role !== 'EMPLOYEE') user.department = department;
    if (typeof isActive === 'boolean' && req.user.role !== 'EMPLOYEE') user.isActive = isActive;
    if (role && req.user.role === 'ADMIN') user.role = role;
    await user.save();
    const { password: _, ...safeUser } = user.toObject();
    res.json(safeUser);
  } catch (err) {
    console.error('Patch user error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  if (!req.params.id || req.params.id === 'undefined')
    return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isActive = false;
    await user.save();
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

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
