import express from 'express';
import Announcement from '../models/Announcement.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const now = new Date();
  const items = await Announcement.find({
    publishAt:  { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    $or: [{ targetDept: null }, { targetDept: req.user.department }],
  }).sort({ pinned: -1, publishAt: -1 });

  // Admin sees all
  const filtered = req.user.role === 'ADMIN'
    ? await Announcement.find().sort({ pinned: -1, publishAt: -1 })
    : items;

  res.json(filtered);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { title, body, targetDept, pinned, publishAt, expiresAt } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const ann = await Announcement.create({
    title, body,
    targetDept: targetDept || null,
    pinned:     pinned || false,
    publishAt:  publishAt ? new Date(publishAt) : new Date(),
    expiresAt:  expiresAt ? new Date(expiresAt) : null,
    createdBy:  req.user._id,
  });
  if (req.app.get('io')) req.app.get('io').emit('announcement:new', ann);
  res.status(201).json(ann);
});

router.post('/:id/read', authMiddleware, async (req, res) => {
  const ann = await Announcement.findById(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  if (!ann.readBy.includes(req.user._id)) {
    ann.readBy.push(req.user._id);
    await ann.save();
  }
  res.json({ message: 'Marked as read' });
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const ann = await Announcement.findByIdAndDelete(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

export default router;
