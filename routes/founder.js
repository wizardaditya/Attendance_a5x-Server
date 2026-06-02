import express from 'express';
import FounderTask from '../models/FounderTask.js';
import User        from '../models/User.js';
import Attendance  from '../models/Attendance.js';
import Task        from '../models/Task.js';
import { authMiddleware, adminOrFounder } from '../middleware/auth.js';

const router = express.Router();
const todayStr = () => new Date().toISOString().split('T')[0];

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
