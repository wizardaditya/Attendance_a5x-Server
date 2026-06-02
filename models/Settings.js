import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  officeName:  { type: String, default: 'A5X Industries' },
  address:     { type: String, default: 'Mumbai, Maharashtra, India' },
  startTime:   { type: String, default: '09:00' },  // HH:MM
  endTime:     { type: String, default: '18:00' },  // HH:MM
  gracePeriod: { type: Number, default: 30 },       // minutes
  timezone:    { type: String, default: 'Asia/Kolkata' },
  workDays:    { type: String, default: 'Mon-Sat' },
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);
