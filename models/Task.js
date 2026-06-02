import mongoose from 'mongoose';

const subtaskSchema = new mongoose.Schema({
  title: String,
  done:  { type: Boolean, default: false },
});

const commentSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  text:     String,
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String, default: '' },
  status:       { type: String, enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
  priority:     { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  assignedTo:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignMode:   { type: String, enum: ['department', 'individuals'], default: 'individuals' },
  department:   String,
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dueDate:      { type: Date, default: null },
  estimatedDur: { type: Number, default: null },
  actualDur:    { type: Number, default: null },
  tags:         [String],
  recurrence:   { type: String, default: null },
  subtasks:     [subtaskSchema],
  attachments:  [String],
  comments:     [commentSchema],
}, { timestamps: true });

export default mongoose.model('Task', taskSchema);
