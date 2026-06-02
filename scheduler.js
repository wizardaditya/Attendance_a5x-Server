/**
 * QR Auto-Scheduler
 * - Reads Settings from DB every minute
 * - Checkin QR:  generates 10min before startTime, expires at startTime + gracePeriod + 15min
 * - Checkout QR: generates 10min before endTime,   expires at endTime + 30min
 */

import QRCode_lib from 'qrcode';
import QRCode     from './models/QRCode.js';
import Settings   from './models/Settings.js';
import { generateQRToken } from './middleware/auth.js';

const CLIENT_URL = () =>
  (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();

// Convert "HH:MM" + timezone to today's Date object in UTC
function toUTC(timeStr, timezone) {
  const now   = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  // Build an ISO-like string and parse using Intl trick
  const localISO = `${dateStr}T${timeStr}:00`;
  // Get UTC offset for that timezone at this moment
  const tzDate = new Date(localISO + 'Z'); // treat as UTC first
  const offset  = new Date(localISO).getTime() - new Date(new Date(localISO).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(tzDate.getTime() - offset);
}

// Actually use Intl to get offset properly
function localTimeToUTC(timeStr, timezone) {
  const now      = new Date();
  const dateStr  = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const fakeDate = new Date(`${dateStr}T${timeStr}:00`);
  // Find what UTC time corresponds to timeStr in timezone
  const utcStr   = fakeDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = fakeDate.toLocaleString('en-US', { timeZone: timezone });
  const diff     = fakeDate - new Date(localStr);
  return new Date(fakeDate.getTime() + diff);
}

async function generateAutoQR(type, location, expiresAt, io) {
  // Deactivate existing auto QR of same type
  await QRCode.updateMany({ isAuto: true, type, isActive: true }, { isActive: false });

  const qr = await QRCode.create({
    location,
    department: 'All',
    type,
    isAuto:    true,
    isActive:  true,
    expiresAt,
  });

  const token     = generateQRToken(qr._id.toString(), location);
  const url       = `${CLIENT_URL()}/checkin?token=${token}&type=${type.toLowerCase()}`;
  const color     = type === 'CHECKIN' ? '#22c55e' : '#3b82f6';
  const qrDataUrl = await QRCode_lib.toDataURL(url, {
    width: 400, margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  qr.token     = token;
  qr.url       = url;
  qr.qrDataUrl = qrDataUrl;
  await qr.save();

  console.log(`✅ Auto ${type} QR generated for ${location}, expires at ${expiresAt.toISOString()}`);

  // Notify frontend via socket
  if (io) io.emit('qr:auto-generated', { type, qrId: qr._id.toString(), location, expiresAt });

  return qr;
}

async function deactivateAutoQR(type, io) {
  const result = await QRCode.updateMany({ isAuto: true, type, isActive: true }, { isActive: false });
  if (result.modifiedCount > 0) {
    console.log(`🔕 Auto ${type} QR deactivated`);
    if (io) io.emit('qr:auto-deactivated', { type });
  }
}

export function startQRScheduler(io) {
  console.log('⏰ QR Scheduler started');

  // Track what we already generated today to avoid duplicates
  const generated = { CHECKIN: null, CHECKOUT: null };

  setInterval(async () => {
    try {
      const settings = await Settings.findOne();
      if (!settings) return;

      const timezone    = settings.timezone    || 'Asia/Kolkata';
      const startTime   = settings.startTime   || '09:00';
      const endTime     = settings.endTime     || '18:00';
      const gracePeriod = settings.gracePeriod ?? 30;
      const location    = settings.officeName  || 'Main Office';

      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });

      // Parse start/end times into today's UTC timestamps
      const [sH, sM] = startTime.split(':').map(Number);
      const [eH, eM] = endTime.split(':').map(Number);

      // Checkin window: (startTime - 10min) to (startTime + gracePeriod + 15min)
      const checkinOpenStr  = `${String(sH).padStart(2,'0')}:${String(Math.max(0, sM - 10)).padStart(2,'0')}`;
      const checkinCloseMin = sH * 60 + sM + gracePeriod + 15;
      const checkinCloseStr = `${String(Math.floor(checkinCloseMin/60)).padStart(2,'0')}:${String(checkinCloseMin%60).padStart(2,'0')}`;

      // Checkout window: (endTime - 10min) to (endTime + 30min)
      const checkoutOpenMin  = eH * 60 + eM - 10;
      const checkoutOpenStr  = `${String(Math.floor(checkoutOpenMin/60)).padStart(2,'0')}:${String(checkoutOpenMin%60).padStart(2,'0')}`;
      const checkoutCloseMin = eH * 60 + eM + 30;
      const checkoutCloseStr = `${String(Math.floor(checkoutCloseMin/60)).padStart(2,'0')}:${String(checkoutCloseMin%60).padStart(2,'0')}`;

      // Get current time in office timezone as HH:MM
      const nowLocal = now.toLocaleTimeString('en-IN', { timeZone: timezone, hour:'2-digit', minute:'2-digit', hour12:false });
      const [nowH, nowM] = nowLocal.split(':').map(Number);
      const nowMinutes = nowH * 60 + nowM;

      const checkinOpenMinutes  = sH * 60 + (sM - 10);
      const checkinCloseMinutes = checkinCloseMin;
      const checkoutOpenMinutes = checkoutOpenMin;
      const checkoutCloseMinutes = checkoutCloseMin;

      // Reset daily generated tracker at midnight
      const todayKey = todayStr;
      if (generated.CHECKIN  && generated.CHECKIN  !== todayKey) generated.CHECKIN  = null;
      if (generated.CHECKOUT && generated.CHECKOUT !== todayKey) generated.CHECKOUT = null;

      // --- CHECKIN QR ---
      if (nowMinutes >= checkinOpenMinutes && nowMinutes < checkinCloseMinutes) {
        // Should be active
        if (generated.CHECKIN !== todayKey) {
          generated.CHECKIN = todayKey;
          const expiresAt = new Date();
          // Set expiry to checkin close time today in UTC
          const expLocal = `${todayStr}T${checkinCloseStr}:00`;
          const expiresAtLocal = new Date(expLocal);
          await generateAutoQR('CHECKIN', location, expiresAtLocal, io);
        }
      } else if (nowMinutes >= checkinCloseMinutes) {
        // Should be deactivated
        await deactivateAutoQR('CHECKIN', io);
      }

      // --- CHECKOUT QR ---
      if (nowMinutes >= checkoutOpenMinutes && nowMinutes < checkoutCloseMinutes) {
        if (generated.CHECKOUT !== todayKey) {
          generated.CHECKOUT = todayKey;
          const expLocal = `${todayStr}T${checkoutCloseStr}:00`;
          const expiresAtLocal = new Date(expLocal);
          await generateAutoQR('CHECKOUT', location, expiresAtLocal, io);
        }
      } else if (nowMinutes >= checkoutCloseMinutes) {
        await deactivateAutoQR('CHECKOUT', io);
      }

    } catch (err) {
      console.error('QR Scheduler error:', err.message);
    }
  }, 60 * 1000); // run every minute
}
