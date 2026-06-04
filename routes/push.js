import express from 'express';
import PushSubscription from '../models/PushSubscription.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET VAPID public key (client needs this to subscribe)
router.get('/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// Save subscription
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      { userId: req.user._id, subscription },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove subscription (on logout / permission revoked)
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint });
    } else {
      await PushSubscription.deleteMany({ userId: req.user._id });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
