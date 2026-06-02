import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = generateToken(user);
  const { password: _, ...safeUser } = user.toObject();
  res.json({ token, user: safeUser });
});

router.get('/me', authMiddleware, (req, res) => {
  const { password: _, ...safeUser } = req.user.toObject();
  res.json(safeUser);
});

router.post('/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  const valid = await bcrypt.compare(currentPassword, req.user.password);
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
  req.user.password = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  res.json({ message: 'Password updated' });
});

export default router;
