import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

mongoose.connection.on('connected', () => console.log('✅ MongoDB connected'));
mongoose.connection.on('error',     (e) => console.error('❌ MongoDB error:', e.message));
mongoose.connection.on('disconnected', () => console.log('⚠️  MongoDB disconnected'));

export const connectDB = async () => {
  // Already connected or connecting
  if (mongoose.connection.readyState >= 1) return;

  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    await seedAdmin();
  } catch (err) {
    console.error('❌ Initial MongoDB connection failed:', err.message);
    console.log('🔄 Will retry in 10 seconds...');
    setTimeout(connectDB, 10000); // retry indefinitely
  }
};

async function seedAdmin() {
  try {
    const { default: User } = await import('./models/User.js');

    // Seed default admin
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
    } else {
      console.log('ℹ️  Admin already exists');
    }

    // Seed secondary admin
    const exists2 = await User.findOne({ email: 'admin@a5x.com' });
    if (!exists2) {
      await User.create({
        name:        'A5X Admin',
        email:       'admin@a5x.com',
        phone:       '9999999998',
        password:    await bcrypt.hash('Admin1234', 10),
        role:        'ADMIN',
        department:  'Management',
        designation: 'System Administrator',
        employeeId:  'A5X-002',
        isActive:    true,
      });
      console.log('✅ Secondary admin seeded');
    } else {
      console.log('ℹ️  Secondary admin already exists');
    }
  } catch (e) {
    console.error('❌ Seed error:', e.message);
  }
}

export const departments = [
  'Engineering', 'Sales', 'HR', 'Management',
  'Operations', 'Finance', 'Marketing', 'Support',
];
