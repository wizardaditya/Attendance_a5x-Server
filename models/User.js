import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  phone:       { type: String, default: '' },
  password:    { type: String, required: true },
  role:        { type: String, enum: ['ADMIN', 'EMPLOYEE'], default: 'EMPLOYEE' },
  department:  { type: String, default: '' },
  designation: { type: String, default: 'Employee' },
  employeeId:  { type: String, unique: true },
  avatar:      { type: String, default: null },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
