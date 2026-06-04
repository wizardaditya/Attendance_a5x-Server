import express from 'express';
import FounderTask from '../models/FounderTask.js';
import User        from '../models/User.js';
import Attendance  from '../models/Attendance.js';
import Task        from '../models/Task.js';
import { authMiddleware, adminOrFounder } from '../middleware/auth.js';
import {
  sendTaskAssignedEmail,
  sendTaskCompletedEmail,
  sendFounderTaskSharedEmail,
} from '../services/email.js';

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
// ?mine=true → only tasks created by me
router.get('/tasks', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const uid = req.user._id;

    // mine=true: only my own tasks (for My Tasks page)
    // mine=false/absent: all tasks I'm involved in (for Team Tasks page)
    const filter = req.query.mine === 'true'
      ? { createdBy: uid }
      : { $or: [{ createdBy: uid }, { sharedWith: uid }, { assignedTo: uid }] };

    const tasks = await FounderTask.find(filter)
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

    const prevStatus = task.status;
    await task.save();

    // Notify all founders + admins when a founder marks task as DONE
    if (status === 'DONE' && prevStatus !== 'DONE') {
      const completedAt = new Date();
      User.find({ role: { $in: ['ADMIN', 'FOUNDER'] }, isActive: true })
        .select('email').lean()
        .then(leaders => {
          const emails = leaders.map(u => u.email).filter(Boolean);
          if (emails.length > 0) {
            sendTaskCompletedEmail({
              taskTitle:       task.title,
              completedByName: req.user.name,
              department:      req.user.designation || 'Founder',
              completedAt,
              recipients:      emails,
            });
          }
        }).catch(e => console.error('Founder task complete email error:', e.message));
    }

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

// Share/assign task to ANY user (founder or employee)
router.post('/tasks/:id/share', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only creator can share' });

    const { targetId, assignedTo, note, shareType } = req.body;
    // targetId = user to share with (founder or employee)
    if (!targetId) return res.status(400).json({ error: 'Target user ID required' });

    const target = await User.findById(targetId);
    if (!target || !target.isActive) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'FOUNDER') {
      // Share with founder - add to sharedWith
      if (!task.sharedWith.map(id => id.toString()).includes(targetId))
        task.sharedWith.push(targetId);
      if (assignedTo) task.assignedTo = targetId;

      // Email the founder being shared with
      if (target.email) {
        sendFounderTaskSharedEmail({
          taskTitle:    task.title,
          description:  task.description,
          priority:     task.priority,
          dueDate:      task.dueDate,
          sharedByName: req.user.name,
          note:         note || '',
          recipient:    target.email,
          shareType:    'founder',
        }).catch(e => console.error('Founder share email error:', e.message));
      }
    } else {
      // Assign to employee - create a regular Task
      const newEmployeeTask = await Task.create({
        title:       task.title,
        description: `${task.description || ''}\n\n${note ? `Note from ${req.user.name}: ${note}` : ''}`.trim(),
        priority:    task.priority,
        assignedTo:  [targetId],
        assignMode:  'individuals',
        department:  target.department,
        createdBy:   req.user._id,
        dueDate:     task.dueDate,
        tags:        task.tags,
      });
      if (!task.employeeAssignees) task.employeeAssignees = [];
      task.employeeAssignees.push(targetId);
      task.employeeTaskId = newEmployeeTask._id;
      req.app.get('io')?.emit('task:created', newEmployeeTask);

      // Email the assigned employee
      if (target.email) {
        sendTaskAssignedEmail({
          taskTitle:      task.title,
          description:    `${task.description || ''}${note ? `\n\nNote from ${req.user.name}: ${note}` : ''}`.trim(),
          priority:       task.priority,
          dueDate:        task.dueDate,
          assignedByName: req.user.name,
          recipient:      target.email,
        }).catch(e => console.error('Employee task email error:', e.message));
      }
    }

    if (note) task.note = note;
    task.isShared = true;
    await task.save();

    req.app.get('io')?.emit('founder:task-shared', {
      taskId: task._id.toString(), taskTitle: task.title,
      sharedBy: req.user.name, sharedWith: targetId,
      targetRole: target.role, targetName: target.name, note,
    });

    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to share task' });
  }
});

// Self-assign a task
router.post('/tasks/:id/self-assign', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const task = await FounderTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    task.assignedTo = req.user._id;
    if (!task.sharedWith.map(id => id.toString()).includes(req.user._id.toString()))
      task.sharedWith.push(req.user._id);
    await task.save();
    const populated = await populateTask(task._id);
    res.json({ ...populated, id: populated._id.toString(), _id: populated._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to self-assign' });
  }
});

// Founders team pulse
router.get('/team/pulse', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const founders = await User.find({ role: 'FOUNDER', isActive: true })
      .select('name designation email')
      .lean();
    const today = todayStr();
    const Attendance_ = Attendance;
    const records = await Attendance_.find({
      userId: { $in: founders.map(f => f._id) },
      date: today,
    });
    const pulse = founders.map(f => {
      const rec = records.find(r => r.userId.toString() === f._id.toString());
      return {
        id:          f._id.toString(),
        name:        f.name,
        designation: f.designation,
        email:       f.email,
        present:     !!rec?.checkIn,
        status:      rec?.status || 'N/A',
        checkIn:     rec?.checkIn || null,
        note:        'No attendance required',
      };
    });
    res.json({ founders: pulse });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load founders pulse' });
  }
});

// List all founders + employees for sharing UI
router.get('/all-users', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const users = await User.find({ isActive: true, role: { $ne: 'ADMIN' } })
      .select('name email designation department role')
      .lean();
    res.json(users.map(u => ({ ...u, id: u._id.toString(), _id: u._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// List all founders (for task sharing UI)
router.get('/founders', authMiddleware, adminOrFounder, async (req, res) => {
  try {
    const founders = await User.find({ isActive: true, role: 'FOUNDER' })
      .select('name email designation department role')
      .lean();
    res.json(founders.map(u => ({ ...u, id: u._id.toString(), _id: u._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load founders' });
  }
});

export default router;
