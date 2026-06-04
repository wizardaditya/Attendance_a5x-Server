import express from 'express';
import Announcement from '../models/Announcement.js';
import User         from '../models/User.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { sendAnnouncementEmail } from '../services/email.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const filtered = req.user.role === 'ADMIN' || req.user.role === 'FOUNDER'
      ? await Announcement.find().sort({ pinned: -1, createdAt: -1 })
      : await Announcement.find({
          $or: [{ targetDept: null }, { targetDept: req.user.department }],
        }).sort({ pinned: -1, createdAt: -1 });
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, body, targetDept, pinned, publishAt, expiresAt, priority } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    const ann = await Announcement.create({
      title, body,
      targetDept: targetDept || null,
      pinned:     pinned  || false,
      priority:   priority || 'GENERAL',
      publishAt:  new Date(), // always now — no scheduling
      expiresAt:  null,       // no expiry
      createdBy:  req.user._id,
    });

    if (req.app.get('io')) req.app.get('io').emit('announcement:new', ann);

    // Send email to all relevant users (fire and forget)
    // Email is sent immediately on creation regardless of publishAt schedule
    const filter = { isActive: true };
    if (targetDept) filter.department = targetDept;
    User.find(filter).select('email').lean().then(users => {
      const emails = users.map(u => u.email).filter(Boolean);
      if (emails.length > 0) {
        sendAnnouncementEmail({
          title, body,
          priority:      priority || 'GENERAL',
          createdByName: req.user.name,
          recipients:    emails,
        });
      }
    }).catch(e => console.error('Announcement email error:', e.message));

    res.status(201).json(ann);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ error: 'Not found' });
    if (!ann.readBy.includes(req.user._id)) {
      ann.readBy.push(req.user._id);
      await ann.save();
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ann = await Announcement.findByIdAndDelete(req.params.id);
    if (!ann) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
