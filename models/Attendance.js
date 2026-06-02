import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:   String,
  userPhone:  String,
  department: String,
  date:       { type: String, required: true }, // YYYY-MM-DD
  checkIn:    { type: Date, default: null },
  checkOut:   { type: Date, default: null },
  duration:   { type: Number, default: null }, // minutes
  status:     { type: String, enum: ['PRESENT', 'LATE', 'ABSENT'], default: 'PRESENT' },
  location:   String,
  latitude:   { type: Number, default: null },
  longitude:  { type: Number, default: null },
  deviceId:   { type: String, default: null },
  flagged:    { type: Boolean, default: false },
  qrId:       String,
}, { timestamps: true });

export default mongoose.model('Attendance', attendanceSchema);
