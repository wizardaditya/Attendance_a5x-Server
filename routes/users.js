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
  const users = await User.find(filter).select('-password');
  res.json(users);
});

router.get('/departments', authMiddleware, (req, res) => res.json(departments));

router.get('/:id', authMiddleware, async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.user.role === 'EMPLOYEE' && req.user._id.toString() !== req.params.id)
    return res.status(403).json({ error: 'Forbidden' });
  res.json(user);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, phone, department, designation, role } = req.body;
  if (!name || !email || !phone || !department)
    return res.status(400).json({ error: 'Name, email, phone, department required' });
  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(409).json({ error: 'Email already exists' });
  const empCount = await User.countDocuments({ role: 'EMPLOYEE' });
  const user = await User.create({
    name, email, phone,
    password:    await bcrypt.hash('Welcome@123', 10),
    role:        role || 'EMPLOYEE',
    department,
    designation: designation || 'Employee',
    employeeId:  `A5X-${String(empCount + 2).padStart(3, '0')}`,
    isActive:    true,
  });
  const { password: _, ...safeUser } = user.toObject();
  res.status(201).json(safeUser);
});

router.patch('/:id', authMiddleware, async (req, res) => {
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
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.isActive = false;
  await user.save();
  res.json({ message: 'User deactivated' });
});

router.post('/:id/reset-password', authMiddleware, adminOnly, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = await bcrypt.hash('Welcome@123', 10);
  await user.save();
  res.json({ message: 'Password reset to Welcome@123' });
});

export default router;
