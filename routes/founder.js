import express from 'express';
import FounderTask from '../models/FounderTask.js';
import User        from '../models/User.js';
import Attendance  from '../models/Attendance.js';
import Task        from '../models/Task.js';
import { authMiddleware, adminOrFounder } from '../middleware/auth.js';

const router  = express.Router();
const todayStr = () => new Date().toISOString().split('T')[0];

const populateTask = (id) =>
  FounderTask.findById(id)
    .populate('createdBy',  'name designation')
    .populate('sharedWith', 'name')
    .populate('assignedTo', 'name')
    .lean();

// ═══════════════════════════════════════════
// OBSERVATION (read-only)
// ═══════════════════════════════════════════

router.get('/overview/attendance', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const { date, department } = req.query;
    const filter = { date: date || todayStr() };
    if (department) filter.department = department;
    const records = await Attendance.find(filter).sort({ checkIn: -1 }).lean();
    res.json(records.map(r => ({ ...r, id: r._id.toString(), _id: r._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load attendance' });
  }
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.get('/overview/stats', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const today          = todayStr();
    const totalEmployees = await User.countDocuments({ role: 'EMPLOYEE', isActive: true });
    const todayRecords   = await Attendance.find({ date: today });
    const checkedIn      = todayRecords.filter(a => a.checkIn).length;
    const late           = todayRecords.filter(a => a.status === 'LATE').length;
    const present        = todayRecords.filter(a => a.status === 'PRESENT').length;
    const totalTasks     = await Task.countDocuments();
    const doneTasks      = await Task.countDocuments({ status: 'DONE' });
    const overdueTasks   = await Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $ne: 'DONE' } });
    const pendingTasks   = await Task.countDocuments({ status: { $in: ['TODO', 'IN_PROGRESS'] } });
    res.json({
      attendance: { totalEmployees, checkedIn, present, late, absent: totalEmployees - checkedIn },
      tasks:      { total: totalTasks, done: doneTasks, overdue: overdueTasks, pending: pendingTasks },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ═══════════════════════════════════════════
// FOUNDER PERSONAL TASKS
// ═══════════════════════════════════════════

// List tasks (own + shared with me)
router.get('/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const uid   = req.user._id;
    const tasks = await FounderTask.find({
      $or: [{ createdBy: uid }, { sharedWith: uid }, { assignedTo: uid }],
    })
      .populate('createdBy',  'name')
      .populate('sharedWith', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json(tasks.map(t => ({ ...t, id: t._id.toString(), _id: t._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// Create task
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
    const populated = await populateTask(task._id);
    res.status(201).json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.patch('/tasks/:id', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can edit' });
    const { title, description, status, priority, dueDate, tags, note } = req.body;
    if (title       !== undefined) task.title       = title;
    if (description !== undefined) task.description = description;
    if (status      !== undefined) task.status      = status;
    if (priority    !== undefined) task.priority    = priority;
    if (dueDate     !== undefined) task.dueDate     = dueDate ? new Date(dueDate) : null;
    if (tags        !== undefined) task.tags        = tags;
    if (note        !== undefined) task.note        = note;
    await task.save();
    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/tasks/:id', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can delete' });
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
      return res.status(403).json({ error: 'Only creator can share' });
    const { founderId, assignedTo, note } = req.body;
    if (!founderId) return res.status(400).json({ error: 'Founder ID required' });
    const target = await User.findById(founderId);
    if (!target || target.role !== 'FOUNDER')
      return res.status(400).json({ error: 'Target must be a FOUNDER' });
    if (!task.sharedWith.map(id => id.toString()).includes(founderId))
      task.sharedWith.push(founderId);
    if (assignedTo) task.assignedTo = founderId;
    if (note)       task.note       = note;
    task.isShared = true;
    await task.save();
    req.app.get('io')?.emit('founder:task-shared', {
      taskId: task._id.toString(), taskTitle: task.title,
      sharedBy: req.user.name, sharedWith: founderId, note,
    });
    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share task' });
  }
});

// List all founders (for sharing UI)
router.get('/founders', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const founders = await User.find({ role: 'FOUNDER', isActive: true })
      .select('name email designation')
      .lean();
    res.json(founders.map(f => ({ ...f, id: f._id.toString(), _id: f._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load founders' });
  }
});

export default router;
