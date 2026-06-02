import mongoose from 'mongoose';

const qrCodeSchema = new mongoose.Schema({
  location:   { type: String, required: true },
  department: { type: String, default: 'All' },
  token:      String,
  url:        String,
  qrDataUrl:  String,
  expiresAt:  Date,
  isActive:   { type: Boolean, default: true },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  scanCount:  { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('QRCode', qrCodeSchema);
