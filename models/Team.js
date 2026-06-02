import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  department:  { type: String, required: true },
  description: { type: String, default: '' },
  color:       { type: String, default: '#39ff14' }, // team color for UI
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lead:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Team', teamSchema);
