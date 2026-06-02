import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) {
    console.log('✅ MongoDB already connected');
    return;
  }

  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    await seedAdmin();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    
    // Retry connection after 5 seconds
    console.log('🔄 Retrying MongoDB connection in 5 seconds...');
    setTimeout(async () => {
      try {
        await mongoose.connect(process.env.MONGO_URI, {
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('✅ MongoDB connected on retry');
        await seedAdmin();
      } catch (retryErr) {
        console.error('❌ MongoDB retry failed:', retryErr.message);
        console.log('⚠️  Server running without MongoDB - some features may not work');
      }
    }, 5000);
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
