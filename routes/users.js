import express from 'express';
import bcrypt from 'bcryptjs';
import { db, generateId, logAudit } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, adminOnly, (req, res) => {
  const { department, search } = req.query;
  let users = db.users.map(({ password:_, ...u }) => u);
  if (department) users = users.filter(u => u.department === department);
  if (search) { const s = search.toLowerCase(); users = users.filter(u => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.phone?.includes(search)); }
  res.json(users);
});

router.get('/departments', authMiddleware, (req, res) => res.json(db.departments));

router.get('/:id', authMiddleware, (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error:'User not found' });
  if (req.user.role === 'EMPLOYEE' && req.user.id !== req.params.id) return res.status(403).json({ error:'Forbidden' });
  const { password:_, ...safeUser } = user;
  res.json(safeUser);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, phone, department, designation, role } = req.body;
  if (!name || !email || !phone || !department) return res.status(400).json({ error:'Name, email, phone, department required' });
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error:'Email already exists' });
  const empCount = db.users.filter(u => u.role === 'EMPLOYEE').length + 1;
  const user = { id:generateId(), name, email, phone, password:await bcrypt.hash('Welcome@123', 10), role:role||'EMPLOYEE', department, designation:designation||'Employee', employeeId:`A5X-${String(empCount+1).padStart(3,'0')}`, avatar:null, joinedAt:new Date(), isActive:true };
  db.users.push(user);
  logAudit(req.user.id, 'USER_CREATED', { email, department });
  const { password:_, ...safeUser } = user;
  res.status(201).json(safeUser);
});

router.patch('/:id', authMiddleware, async (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error:'User not found' });
  if (req.user.role === 'EMPLOYEE' && req.user.id !== req.params.id) return res.status(403).json({ error:'Forbidden' });
  const { name, phone, department, designation, isActive, role } = req.body;
  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (designation) user.designation = designation;
  if (department && req.user.role !== 'EMPLOYEE') user.department = department;
  if (typeof isActive === 'boolean' && req.user.role !== 'EMPLOYEE') user.isActive = isActive;
  if (role && req.user.role === 'ADMIN') user.role = role;
  const { password:_, ...safeUser } = user;
  res.json(safeUser);
});

router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error:'User not found' });
  user.isActive = false;
  logAudit(req.user.id, 'USER_DEACTIVATED', { id:user.id });
  res.json({ message:'User deactivated' });
});

router.post('/:id/reset-password', authMiddleware, adminOnly, async (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error:'User not found' });
  user.password = await bcrypt.hash('Welcome@123', 10);
  res.json({ message:'Password reset to Welcome@123' });
});

export default router;
