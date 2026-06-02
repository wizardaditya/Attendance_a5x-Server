import express from 'express';
import Team from '../models/Team.js';
import User from '../models/User.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get all teams (admin sees all, employee sees only their teams)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let teams;
    if (req.user.role === 'ADMIN') {
      teams = await Team.find({ isActive: true })
        .populate('members', 'name email department designation employeeId isActive')
        .populate('lead',    'name email department')
        .sort({ department: 1, name: 1 });
    } else {
      // Employee: only teams they belong to
      teams = await Team.find({ isActive: true, members: req.user._id })
        .populate('members', 'name email department designation employeeId isActive')
        .populate('lead',    'name email department')
        .sort({ name: 1 });
    }
    // Normalize _id
    const normalized = teams.map(t => {
      const obj = t.toObject();
      return {
        ...obj,
        id: obj._id.toString(),
        _id: obj._id.toString(),
        members: (obj.members || []).map(m => ({ ...m, id: m._id.toString(), _id: m._id.toString() })),
        lead: obj.lead ? { ...obj.lead, id: obj.lead._id.toString(), _id: obj.lead._id.toString() } : null,
      };
    });
    res.json(normalized);
  } catch (err) {
    console.error('Get teams error:', err.message);
    res.status(500).json({ error: 'Failed to load teams' });
  }
});

// Get single team
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('members', 'name email department designation employeeId isActive')
      .populate('lead',    'name email department');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const obj = team.toObject();
    res.json({ ...obj, id: obj._id.toString(), _id: obj._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load team' });
  }
});

// Create team (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, department, description, color, members, lead } = req.body;
    if (!name)       return res.status(400).json({ error: 'Team name required' });
    if (!department) return res.status(400).json({ error: 'Department required' });

    const team = await Team.create({
      name, department,
      description: description || '',
      color:       color || '#39ff14',
      members:     members || [],
      lead:        lead || null,
      createdBy:   req.user._id,
      isActive:    true,
    });

    const populated = await Team.findById(team._id)
      .populate('members', 'name email department designation employeeId isActive')
      .populate('lead',    'name email department');

    const obj = populated.toObject();
    if (req.app.get('io')) req.app.get('io').emit('team:created', { teamId: obj._id.toString(), name: obj.name });
    res.status(201).json({ ...obj, id: obj._id.toString(), _id: obj._id.toString() });
  } catch (err) {
    console.error('Create team error:', err.message);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// Update team (admin only)
router.patch('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { name, department, description, color, members, lead, isActive } = req.body;
    if (name        !== undefined) team.name        = name;
    if (department  !== undefined) team.department  = department;
    if (description !== undefined) team.description = description;
    if (color       !== undefined) team.color       = color;
    if (members     !== undefined) team.members     = members;
    if (lead        !== undefined) team.lead        = lead || null;
    if (isActive    !== undefined) team.isActive    = isActive;

    await team.save();

    const populated = await Team.findById(team._id)
      .populate('members', 'name email department designation employeeId isActive')
      .populate('lead',    'name email department');

    const obj = populated.toObject();
    if (req.app.get('io')) req.app.get('io').emit('team:updated', { teamId: obj._id.toString() });
    res.json({ ...obj, id: obj._id.toString(), _id: obj._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// Delete team (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    team.isActive = false;
    await team.save();
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Get team pulse - live attendance status of team members
router.get('/:id/pulse', authMiddleware, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('members', 'name department designation');
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const today = new Date().toISOString().split('T')[0];
    const Attendance = (await import('../models/Attendance.js')).default;
    const todayRecords = await Attendance.find({
      userId: { $in: team.members.map(m => m._id) },
      date: today,
    });

    const pulse = team.members.map(member => {
      const record = todayRecords.find(r => r.userId.toString() === member._id.toString());
      return {
        id:         member._id.toString(),
        name:       member.name,
        department: member.department,
        designation: member.designation,
        status:     record ? record.status : 'ABSENT',
        checkIn:    record?.checkIn || null,
        checkOut:   record?.checkOut || null,
        present:    !!record?.checkIn,
      };
    });

    res.json({ team: { id: team._id.toString(), name: team.name, color: team.color }, pulse });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get team pulse' });
  }
});

export default router;
