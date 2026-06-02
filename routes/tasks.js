import express from 'express';
import { db, generateId } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// GET /api/tasks — list tasks
// Admin: can filter by department, assignedTo, status, priority
// Employee: only sees tasks assigned to them
router.get('/', authMiddleware, (req, res) => {
  let tasks = [...db.tasks];

  if (req.user.role === 'EMPLOYEE') {
    tasks = tasks.filter(t => t.assignedTo.includes(req.user.id));
  } else {
    // Admin filters
    const { department, assignedTo, status, priority } = req.query;
    if (department) tasks = tasks.filter(t => t.department === department);
    if (assignedTo) tasks = tasks.filter(t => t.assignedTo.includes(assignedTo));
    if (status) tasks = tasks.filter(t => t.status === status);
    if (priority) tasks = tasks.filter(t => t.priority === priority);
  }

  // Enrich with assignee names
  const enriched = tasks.map(t => ({
    ...t,
    assignees: t.assignedTo.map(id => {
      const u = db.users.find(u => u.id === id);
      return u ? { id: u.id, name: u.name, department: u.department } : null;
    }).filter(Boolean),
  }));

  res.json(enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// GET /api/tasks/stats — admin analytics
router.get('/stats', authMiddleware, adminOnly, (req, res) => {
  const { department } = req.query;
  let tasks = [...db.tasks];
  if (department) tasks = tasks.filter(t => t.department === department);

  const byStatus = {}, byPriority = {}, byDepartment = {};
  tasks.forEach(t => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    byDepartment[t.department] = (byDepartment[t.department] || 0) + 1;
  });
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length;
  res.json({ total: tasks.length, byStatus, byPriority, byDepartment, overdue });
});

// GET /api/tasks/today — employee's tasks for today
router.get('/today', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const tasks = db.tasks.filter(t => {
    const assigned = t.assignedTo.includes(req.user.id);
    const dueToday = t.dueDate && t.dueDate.toString().startsWith(today);
    return assigned && (dueToday || t.status !== 'DONE');
  });
  res.json(tasks);
});

// GET /api/tasks/department-summary — tasks grouped by department (admin)
router.get('/department-summary', authMiddleware, adminOnly, (req, res) => {
  const summary = {};
  db.departments.forEach(dept => {
    const deptTasks = db.tasks.filter(t => t.department === dept);
    summary[dept] = {
      total: deptTasks.length,
      todo: deptTasks.filter(t => t.status === 'TODO').length,
      inProgress: deptTasks.filter(t => t.status === 'IN_PROGRESS').length,
      done: deptTasks.filter(t => t.status === 'DONE').length,
      overdue: deptTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length,
    };
  });
  res.json(summary);
});

// POST /api/tasks — create task
// assignMode: 'department' (all members of a dept) | 'individuals' (specific user IDs)
router.post('/', authMiddleware, async (req, res) => {
  const {
    title, description, priority, dueDate, estimatedDur,
    tags, subtasks, recurrence,
    assignMode,       // 'department' | 'individuals'
    department,       // required for both modes
    assignedTo,       // array of user IDs (for 'individuals' mode)
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title required' });
  if (!department) return res.status(400).json({ error: 'Department required' });

  let finalAssignedTo = [];

  if (assignMode === 'department') {
    // Assign to ALL active employees in the department
    const deptMembers = db.users.filter(u => u.department === department && u.isActive && u.role === 'EMPLOYEE');
    if (deptMembers.length === 0) return res.status(400).json({ error: `No active employees found in ${department} department` });
    finalAssignedTo = deptMembers.map(u => u.id);
  } else {
    // Assign to specific individuals
    if (!assignedTo || assignedTo.length === 0) return res.status(400).json({ error: 'Select at least one person to assign' });
    finalAssignedTo = assignedTo;
  }

  const task = {
    id: generateId(),
    title,
    description: description || '',
    status: 'TODO',
    priority: priority || 'MEDIUM',
    assignedTo: finalAssignedTo,
    assignMode: assignMode || 'individuals',
    department,
    createdBy: req.user.id,
    dueDate: dueDate ? new Date(dueDate) : null,
    estimatedDur: estimatedDur || null,
    actualDur: null,
    tags: tags || [],
    recurrence: recurrence || null,
    subtasks: (subtasks || []).map(s => ({ id: generateId(), title: s, done: false })),
    attachments: [],
    comments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.tasks.push(task);
  if (req.app.get('io')) req.app.get('io').emit('task:created', task);
  res.status(201).json(task);
});

// PATCH /api/tasks/:id — update task
router.patch('/:id', authMiddleware, (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.user.role === 'EMPLOYEE' && !task.assignedTo.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'estimatedDur', 'actualDur', 'tags', 'subtasks', 'assignedTo', 'department'];
  allowed.forEach(k => { if (req.body[k] !== undefined) task[k] = req.body[k]; });
  task.updatedAt = new Date();
  if (req.app.get('io')) req.app.get('io').emit('task:updated', task);
  res.json(task);
});

// DELETE /api/tasks/:id
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  db.tasks.splice(idx, 1);
  res.json({ message: 'Deleted' });
});

// POST /api/tasks/:id/comment
router.post('/:id/comment', authMiddleware, (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const comment = { id: generateId(), userId: req.user.id, userName: req.user.name, text: req.body.text, createdAt: new Date() };
  task.comments.push(comment);
  res.json(comment);
});

export default router;
