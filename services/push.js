import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

// ── Setup VAPID ──────────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@worksyne.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('🔔 Web Push: VAPID configured');
} else {
  console.warn('⚠️  Web Push: VAPID keys not set in .env');
}

// ── Send push to specific users ──────────────────────────────────────────────
export async function sendPushToUsers(userIds, { title, body, icon, url }) {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const subs = await PushSubscription.find({ userId: { $in: ids } });
  console.log(`🔔 Push: found ${subs.length} subscriptions for ${ids.length} users`);
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title,
    body,
    icon:  icon  || '/favicon.svg',
    badge: '/favicon.svg',
    url:   url   || '/',
  });

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(s.subscription, payload))
  );

  // Remove expired/invalid subscriptions
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const status = result.reason?.statusCode;
      if (status === 404 || status === 410) {
        // Subscription gone — delete it
        PushSubscription.deleteOne({ _id: subs[i]._id }).catch(() => {});
      }
    }
  });

  const sent = results.filter(r => r.status === 'fulfilled').length;
  if (sent > 0) console.log(`🔔 Push sent to ${sent}/${subs.length} devices`);
}

// ── Send push to ALL active users (announcements) ───────────────────────────
export async function sendPushToAll({ title, body, icon, url }) {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  const subs = await PushSubscription.find();
  console.log(`🔔 Push broadcast: found ${subs.length} total subscriptions`);
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title,
    body,
    icon:  icon  || '/favicon.svg',
    badge: '/favicon.svg',
    url:   url   || '/',
  });

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(s.subscription, payload))
  );

  // Clean up dead subscriptions
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const status = result.reason?.statusCode;
      if (status === 404 || status === 410) {
        PushSubscription.deleteOne({ _id: subs[i]._id }).catch(() => {});
      }
    }
  });

  const sent = results.filter(r => r.status === 'fulfilled').length;
  if (sent > 0) console.log(`🔔 Push (broadcast) sent to ${sent}/${subs.length} devices`);
}
