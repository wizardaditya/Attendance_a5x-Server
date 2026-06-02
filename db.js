import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
    await seedAdmin();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// Seed admin account on first run
async function seedAdmin() {
  const { default: User } = await import('./models/User.js');
  const exists = await User.findOne({ email: 'admin@a5xindustries.com' });
  if (!exists) {
    await User.create({
      name:        'A5X Admin',
      email:       'admin@a5xindustries.com',
      phone:       '9999999999',
      password:    await bcrypt.hash('admin123', 10),
      role:        'ADMIN',
      department:  'Management',
      designation: 'System Administrator',
      employeeId:  'A5X-001',
      isActive:    true,
    });
    console.log('✅ Admin account seeded');
  }
}

export const departments = [
  'Engineering', 'Sales', 'HR', 'Management',
  'Operations', 'Finance', 'Marketing', 'Support',
];
