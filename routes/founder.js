import express from 'express';
import FounderTask from '../models/FounderTask.js';
import User        from '../models/User.js';
import Attendance  from '../models/Attendance.js';
import Task        from '../models/Task.js';
import { authMiddleware, adminOrFounder } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();
const todayStr = () => new Date().toISOString().split('T')[0];

const populateTask = (id) =>
  FounderTask.findById(id)
    .populate('createdBy',    'name designation')
    .populate('sharedWith',   'name')
    .populate('assignedTo',   'name designation role')
    .populate('employeeAssignees', 'name department designation')
    .lean();

// ─── OBSERVATION ─────────────────────────────────────────────────────────────

router.get('/overview/attendance', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { date, department } = req.query;
    const filter = { date: date || todayStr() };
    if (department) filter.department = department;
    const records = await Attendance.find(filter).sort({ checkIn: -1 }).lean();
    res.json(records.map(r => ({ ...r, id: r._id.toString(), _id: r._id.toString() })));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.get('/overview/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { department, status, assignedTo } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (status)     filter.status     = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name department')
      .sort({ createdAt: -1 })
      .lean();
    res.json(tasks.map(t => ({ ...t, id: t._id.toString(), _id: t._id.toString() })));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.get('/overview/stats', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const today = todayStr();
    const totalEmployees = await User.countDocuments({ role: 'EMPLOYEE', isActive: true });
    const todayRecords   = await Attendance.find({ date: today });
    const checkedIn = todayRecords.filter(a => a.checkIn).length;
    const late      = todayRecords.filter(a => a.status === 'LATE').length;
    const present   = todayRecords.filter(a => a.status === 'PRESENT').length;
    const totalTasks   = await Task.countDocuments();
    const doneTasks    = await Task.countDocuments({ status: 'DONE' });
    const overdueTasks = await Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $ne: 'DONE' } });
    const pendingTasks = await Task.countDocuments({ status: { $in: ['TODO', 'IN_PROGRESS'] } });
    res.json({
      attendance: { totalEmployees, checkedIn, present, late, absent: totalEmployees - checkedIn },
      tasks:      { total: totalTasks, done: doneTasks, overdue: overdueTasks, pending: pendingTasks },
    });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ─── FOUNDER TEAM ─────────────────────────────────────────────────────────────

// All founders (the team)
router.get('/founders', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const founders = await User.find({ role: 'FOUNDER', isActive: true })
      .select('name email designation')
      .lean();
    res.json(founders.map(f => ({ ...f, id: f._id.toString(), _id: f._id.toString() })));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// All employees (for assigning tasks to them)
router.get('/employees', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const employees = await User.find({ role: 'EMPLOYEE', isActive: true })
      .select('name email department designation')
      .lean();
    res.json(employees.map(e => ({ ...e, id: e._id.toString(), _id: e._id.toString() })));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ─── FOUNDER TASKS ────────────────────────────────────────────────────────────

router.get('/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const userId = req.user._id;
    const tasks = await FounderTask.find({
      $or: [
        { createdBy:  userId },
        { sharedWith: userId },
        { assignedTo: userId },
      ],
    })
      .populate('createdBy',         'name designation')
      .populate('sharedWith',        'name')
      .populate('assignedTo',        'name designation role')
      .populate('employeeAssignees', 'name department designation')
      .sort({ createdAt: -1 })
      .lean();
    res.json(tasks.map(t => ({ ...t, id: t._id.toString(), _id: t._id.toString() })));
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.post('/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { title, description, priority, dueDate, tags, note } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const task = await FounderTask.create({
      title,
      description: description || '',
      priority:    priority    || 'MEDIUM',
      dueDate:     dueDate ? new Date(dueDate) : null,
      tags:        tags   || [],
      note:        note   || '',
      createdBy:   req.user._id,
    });
    const populated = await populateTask(task._id);
    res.status(201).json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch { res.status(500).json({ error: 'Failed to create task' }); }
});

router.patch('/tasks/:id', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can edit' });
    const allowed = ['title','description','status','priority','dueDate','tags','note'];
    allowed.forEach(k => { if (req.body[k] !== undefined) task[k] = req.body[k]; });
    await task.save();
    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/tasks/:id', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can delete' });
    await FounderTask.deleteOne({ _id: req.params.id });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ─── SHARE with another founder ───────────────────────────────────────────────
router.post('/tasks/:id/share', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can share' });

    const { founderId, assign, note } = req.body;
    if (!founderId) return res.status(400).json({ error: 'Founder ID required' });
    const target = await User.findById(founderId);
    if (!target || target.role !== 'FOUNDER')
      return res.status(400).json({ error: 'Target must be a Founder' });

    if (!task.sharedWith.map(id => id.toString()).includes(founderId))
      task.sharedWith.push(founderId);
    if (assign) task.assignedTo = founderId;
    if (note)   task.note = note;
    task.isShared = true;
    await task.save();

    req.app.get('io')?.emit('founder:task-shared', {
      taskId: task._id.toString(), taskTitle: task.title,
      sharedBy: req.user.name, sharedWith: founderId, note,
    });

    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ─── TRANSFER ownership to another founder ───────────────────────────────────
router.post('/tasks/:id/transfer', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can transfer' });

    const { founderId, note } = req.body;
    if (!founderId) return res.status(400).json({ error: 'Founder ID required' });
    const target = await User.findById(founderId);
    if (!target || target.role !== 'FOUNDER')
      return res.status(400).json({ error: 'Target must be a Founder' });

    // Transfer: change creator, add original creator to sharedWith
    const originalCreator = task.createdBy;
    task.createdBy = founderId;
    if (!task.sharedWith.map(id => id.toString()).includes(originalCreator.toString()))
      task.sharedWith.push(originalCreator);
    task.assignedTo = founderId;
    if (note) task.note = `[Transferred by ${req.user.name}]: ${note}`;
    task.isShared = true;
    await task.save();

    req.app.get('io')?.emit('founder:task-transferred', {
      taskId: task._id.toString(), taskTitle: task.title,
      transferredBy: req.user.name, transferredTo: founderId, note,
    });

    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch { res.status(500).json({ error: 'Failed to transfer' }); }
});

// ─── ASSIGN to employees ──────────────────────────────────────────────────────
router.post('/tasks/:id/assign-employees', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { employeeIds, note, dueDate } = req.body;
    if (!employeeIds || employeeIds.length === 0)
      return res.status(400).json({ error: 'Select at least one employee' });

    // Verify all are employees
    const employees = await User.find({ _id: { $in: employeeIds }, role: 'EMPLOYEE' });
    if (employees.length === 0) return res.status(400).json({ error: 'No valid employees found' });

    // Create a regular Task and assign to employees
    const newTask = await Task.create({
      title:       task.title,
      description: task.description || '',
      priority:    task.priority,
      assignedTo:  employees.map(e => e._id),
      assignMode:  'individuals',
      department:  employees[0].department,
      createdBy:   req.user._id,
      dueDate:     dueDate ? new Date(dueDate) : task.dueDate,
      tags:        task.tags,
    });

    // Mark founder task as assigned to employees
    task.employeeAssignees = employees.map(e => e._id);
    task.employeeTaskId    = newTask._id;
    if (note) task.note = note;
    await task.save();

    req.app.get('io')?.emit('task:created', newTask);
    req.app.get('io')?.emit('founder:task-assigned-to-employees', {
      taskId: task._id.toString(), taskTitle: task.title,
      assignedTo: employees.map(e => e.name),
    });

    const populated = await populateTask(task._id);
    res.json({
      founderTask: { ...populated, id: populated._id.toString(), _id: populated._id.toString() },
      employeeTask: newTask,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign to employees' });
  }
});

export default router;

// ─── OBSERVATION: All employees attendance (read-only) ───────────────────────

router.get('/overview/attendance', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { date, department } = req.query;
    const filter = { date: date || todayStr() };
    if (department) filter.department = department;
    const records = await Attendance.find(filter).sort({ checkIn: -1 }).lean();
    const normalized = records.map(r => ({ ...r, id: r._id.toString(), _id: r._id.toString() }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load attendance' });
  }
});

router.get('/overview/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { department, status, assignedTo } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (status)     filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name department')
      .sort({ createdAt: -1 })
      .lean();
    const normalized = tasks.map(t => ({ ...t, id: t._id.toString(), _id: t._id.toString() }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.get('/overview/stats', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const today = todayStr();
    const totalEmployees = await User.countDocuments({ role: 'EMPLOYEE', isActive: true });
    const todayRecords   = await Attendance.find({ date: today });
    const checkedIn = todayRecords.filter(a => a.checkIn).length;
    const late      = todayRecords.filter(a => a.status === 'LATE').length;
    const present   = todayRecords.filter(a => a.status === 'PRESENT').length;

    const totalTasks    = await Task.countDocuments();
    const doneTasks     = await Task.countDocuments({ status: 'DONE' });
    const overdueTasks  = await Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $ne: 'DONE' } });
    const pendingTasks  = await Task.countDocuments({ status: { $in: ['TODO', 'IN_PROGRESS'] } });

    res.json({
      attendance: { totalEmployees, checkedIn, present, late, absent: totalEmployees - checkedIn },
      tasks:      { total: totalTasks, done: doneTasks, overdue: overdueTasks, pending: pendingTasks },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ─── FOUNDER PERSONAL TASKS ──────────────────────────────────────────────────

// Get founder's own tasks + tasks shared with them
router.get('/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const userId = req.user._id;
    const tasks = await FounderTask.find({
      $or: [
        { createdBy: userId },
        { sharedWith: userId },
        { assignedTo: userId },
      ],
    })
      .populate('createdBy',  'name')
      .populate('sharedWith', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const normalized = tasks.map(t => ({ ...t, id: t._id.toString(), _id: t._id.toString() }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load founder tasks' });
  }
});

// Create founder task
router.post('/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { title, description, priority, dueDate, tags, note } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const task = await FounderTask.create({
      title,
      description: description || '',
      priority:    priority    || 'MEDIUM',
      dueDate:     dueDate     ? new Date(dueDate) : null,
      tags:        tags        || [],
      note:        note        || '',
      createdBy:   req.user._id,
    });

    const populated = await FounderTask.findById(task._id)
      .populate('createdBy', 'name')
      .lean();
    res.status(201).json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update founder task
router.patch('/tasks/:id', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Only creator can edit
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only task creator can edit' });

    const { title, description, status, priority, dueDate, tags, note } = req.body;
    if (title       !== undefined) task.title       = title;
    if (description !== undefined) task.description = description;
    if (status      !== undefined) task.status      = status;
    if (priority    !== undefined) task.priority    = priority;
    if (dueDate     !== undefined) task.dueDate     = dueDate ? new Date(dueDate) : null;
    if (tags        !== undefined) task.tags        = tags;
    if (note        !== undefined) task.note        = note;

    await task.save();
    const populated = await FounderTask.findById(task._id)
      .populate('createdBy',  'name')
      .populate('sharedWith', 'name')
      .populate('assignedTo', 'name')
      .lean();
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete founder task
router.delete('/tasks/:id', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only task creator can delete' });
    await FounderTask.deleteOne({ _id: req.params.id });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Share task with another founder
router.post('/tasks/:id/share', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only task creator can share' });

    const { founderId, assignedTo, note } = req.body;
    if (!founderId) return res.status(400).json({ error: 'Founder ID required' });

    // Verify target is a founder
    const targetFounder = await User.findById(founderId);
    if (!targetFounder || targetFounder.role !== 'FOUNDER')
      return res.status(400).json({ error: 'Target user must be a FOUNDER' });

    // Add to sharedWith if not already
    if (!task.sharedWith.map(id => id.toString()).includes(founderId)) {
      task.sharedWith.push(founderId);
    }

    // Optionally assign
    if (assignedTo) task.assignedTo = founderId;
    if (note)       task.note       = note;
    task.isShared = true;

    await task.save();

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.emit('founder:task-shared', {
        taskId:    task._id.toString(),
        taskTitle: task.title,
        sharedBy:  req.user.name,
        sharedWith: founderId,
        note,
      });
    }

    const populated = await FounderTask.findById(task._id)
      .populate('createdBy',  'name')
      .populate('sharedWith', 'name')
      .populate('assignedTo', 'name')
      .lean();
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share task' });
  }
});

// Get list of all founders (for sharing)
router.get('/founders', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const founders = await User.find({ role: 'FOUNDER', isActive: true })
      .select('name email designation')
      .lean();
    const normalized = founders.map(f => ({ ...f, id: f._id.toString(), _id: f._id.toString() }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load founders' });
  }
});

export default router;
