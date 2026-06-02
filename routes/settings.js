import express from 'express';
import Settings from '../models/Settings.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get settings (public - needed for checkin page too)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Save settings (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { officeName, address, startTime, endTime, gracePeriod, timezone, workDays } = req.body;
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    if (officeName  !== undefined) settings.officeName  = officeName;
    if (address     !== undefined) settings.address     = address;
    if (startTime   !== undefined) settings.startTime   = startTime;
    if (endTime     !== undefined) settings.endTime     = endTime;
    if (gracePeriod !== undefined) settings.gracePeriod = Number(gracePeriod);
    if (timezone    !== undefined) settings.timezone    = timezone;
    if (workDays    !== undefined) settings.workDays    = workDays;

    await settings.save();
    res.json(settings);
  } catch (err) {
    console.error('Save settings error:', err.message);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
