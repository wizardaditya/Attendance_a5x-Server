import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  body:       { type: String, required: true },
  targetDept: { type: String, default: null },
  pinned:     { type: Boolean, default: false },
  publishAt:  { type: Date, default: Date.now },
  expiresAt:  { type: Date, default: null },
  readBy:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Announcement', announcementSchema);
