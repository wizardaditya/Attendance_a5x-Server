import mongoose from 'mongoose';

const founderTaskSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  status:      { type: String, enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
  priority:    { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  dueDate:     { type: Date, default: null },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Shared with other founders
  sharedWith:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // If shared as assignment to another founder
  assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isShared:    { type: Boolean, default: false },
  note:        { type: String, default: '' }, // sharing note/message
  tags:        [String],
}, { timestamps: true });

export default mongoose.model('FounderTask', founderTaskSchema);
