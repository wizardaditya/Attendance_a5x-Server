import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { departments } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.user.role === 'EMPLOYEE') {
    filter.assignedTo = req.user._id;
  } else {
    const { department, assignedTo, status, priority } = req.query;
    if (department) filter.department = department;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (status)     filter.status = status;
    if (priority)   filter.priority = priority;
  }
  const tasks = await Task.find(filter)
    .populate('assignedTo', 'name department')
    .sort({ createdAt: -1 });

  const enriched = tasks.map(t => ({
    ...t.toObject(),
    assignees: t.assignedTo.map(u => ({ id: u._id, name: u.name, department: u.department })),
  }));
  res.json(enriched);
});

router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  const tasks = await Task.find(filter);

  const byStatus = {}, byPriority = {}, byDepartment = {};
  tasks.forEach(t => {
    byStatus[t.status]         = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority]     = (byPriority[t.priority] || 0) + 1;
    byDepartment[t.department] = (byDepartment[t.department] || 0) + 1;
  });
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length;
  res.json({ total: tasks.length, byStatus, byPriority, byDepartment, overdue });
});

router.get('/today', authMiddleware, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const tasks = await Task.find({
    assignedTo: req.user._id,
    $or: [
      { dueDate: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59') } },
      { status: { $ne: 'DONE' } },
    ],
  });
  res.json(tasks);
});

router.get('/department-summary', authMiddleware, adminOnly, async (req, res) => {
  const summary = {};
  for (const dept of departments) {
    const deptTasks = await Task.find({ department: dept });
    summary[dept] = {
      total:      deptTasks.length,
      todo:       deptTasks.filter(t => t.status === 'TODO').length,
      inProgress: deptTasks.filter(t => t.status === 'IN_PROGRESS').length,
      done:       deptTasks.filter(t => t.status === 'DONE').length,
      overdue:    deptTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length,
    };
  }
  res.json(summary);
});

router.post('/', authMiddleware, async (req, res) => {
  const { title, description, priority, dueDate, estimatedDur, tags, subtasks, recurrence, assignMode, department, assignedTo } = req.body;
  if (!title)      return res.status(400).json({ error: 'Title required' });
  if (!department) return res.status(400).json({ error: 'Department required' });

  let finalAssignedTo = [];
  if (assignMode === 'department') {
    const members = await User.find({ department, isActive: true, role: 'EMPLOYEE' });
    if (members.length === 0)
      return res.status(400).json({ error: `No active employees in ${department}` });
    finalAssignedTo = members.map(u => u._id);
  } else {
    if (!assignedTo || assignedTo.length === 0)
      return res.status(400).json({ error: 'Select at least one person' });
    finalAssignedTo = assignedTo;
  }

  const task = await Task.create({
    title,
    description:  description || '',
    priority:     priority || 'MEDIUM',
    assignedTo:   finalAssignedTo,
    assignMode:   assignMode || 'individuals',
    department,
    createdBy:    req.user._id,
    dueDate:      dueDate ? new Date(dueDate) : null,
    estimatedDur: estimatedDur || null,
    tags:         tags || [],
    recurrence:   recurrence || null,
    subtasks:     (subtasks || []).map(s => ({ title: s, done: false })),
  });

  if (req.app.get('io')) req.app.get('io').emit('task:created', task);
  res.status(201).json(task);
});

router.patch('/:id', authMiddleware, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.user.role === 'EMPLOYEE' && !task.assignedTo.map(id => id.toString()).includes(req.user._id.toString()))
    return res.status(403).json({ error: 'Forbidden' });

  const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'estimatedDur', 'actualDur', 'tags', 'subtasks', 'assignedTo', 'department'];
  allowed.forEach(k => { if (req.body[k] !== undefined) task[k] = req.body[k]; });
  await task.save();

  if (req.app.get('io')) req.app.get('io').emit('task:updated', task);
  res.json(task);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ message: 'Deleted' });
});

router.post('/:id/comment', authMiddleware, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.comments.push({ userId: req.user._id, userName: req.user.name, text: req.body.text });
  await task.save();
  res.json(task.comments[task.comments.length - 1]);
});

export default router;
