import express from 'express';
import { db, generateId, logAudit } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const now = new Date();
  const items = db.announcements.filter(a => {
    const published = new Date(a.publishAt) <= now;
    const notExpired = !a.expiresAt || new Date(a.expiresAt) > now;
    const targeted = !a.targetDept || a.targetDept === req.user.department || req.user.role === 'ADMIN';
    return published && notExpired && targeted;
  }).sort((a,b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.publishAt) - new Date(a.publishAt);
  });
  res.json(items);
});

router.post('/', authMiddleware, adminOnly, (req, res) => {
  const { title, body, targetDept, pinned, publishAt, expiresAt } = req.body;
  if (!title || !body) return res.status(400).json({ error:'Title and body required' });
  const ann = { id:generateId(), title, body, targetDept:targetDept||null, pinned:pinned||false, publishAt:publishAt?new Date(publishAt):new Date(), expiresAt:expiresAt?new Date(expiresAt):null, readBy:[], createdBy:req.user.id, createdAt:new Date() };
  db.announcements.push(ann);
  if (req.app.get('io')) req.app.get('io').emit('announcement:new', ann);
  res.status(201).json(ann);
});

router.post('/:id/read', authMiddleware, (req, res) => {
  const ann = db.announcements.find(a => a.id === req.params.id);
  if (!ann) return res.status(404).json({ error:'Not found' });
  if (!ann.readBy.includes(req.user.id)) ann.readBy.push(req.user.id);
  res.json({ message:'Marked as read' });
});

router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const idx = db.announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error:'Not found' });
  db.announcements.splice(idx, 1);
  res.json({ message:'Deleted' });
});

export default router;
