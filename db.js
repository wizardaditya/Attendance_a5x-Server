import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const adminHash = bcrypt.hashSync('admin123', 10);

// Only the admin account — no dummy employees
export const db = {
  users: [
    {
      id: 'admin-001',
      name: 'A5X Admin',
      email: 'admin@a5xindustries.com',
      phone: '9999999999',
      password: adminHash,
      role: 'ADMIN',
      department: 'Management',
      designation: 'System Administrator',
      employeeId: 'A5X-001',
      avatar: null,
      joinedAt: new Date('2024-01-01'),
      isActive: true,
    },
  ],
  attendance: [],
  qrCodes: [],
  tasks: [],
  announcements: [],
  auditLog: [],
  departments: ['Engineering', 'Sales', 'HR', 'Management', 'Operations', 'Finance', 'Marketing', 'Support'],
};

export const generateId = () => uuidv4();

export const logAudit = (adminId, action, details) => {
  db.auditLog.push({ id: generateId(), adminId, action, details, timestamp: new Date() });
};
