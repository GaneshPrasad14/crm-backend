const express = require('express');
const router = express.Router();
const { createLead, getLeads, getLeadById, updateLead, deleteLead, assignLeadToUser } = require('../models/Lead');
const authenticateToken = require('../middleware/auth');

// Create a new lead (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const lead = await createLead({ ...req.body, created_by: req.user.id });
    res.status(201).json({ data: lead });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create lead', error: err.message });
  }
});

// Get all leads (admin: all, member: assigned)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const leads = await getLeads(req.user);
    res.json({ data: leads });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch leads', error: err.message });
  }
});

// Get a single lead by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    // Only admin or assigned member can view
    if (req.user.role !== 'admin' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json({ data: lead });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch lead', error: err.message });
  }
});

// Update a lead (admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const result = await updateLead(req.params.id, req.body);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead updated' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update lead', error: err.message });
  }
});

// Delete a lead (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const result = await deleteLead(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete lead', error: err.message });
  }
});

// Assign a lead to a user (admin only)
router.post('/:id/assign', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { userId } = req.body;
    const result = await assignLeadToUser(req.params.id, userId);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead assigned' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to assign lead', error: err.message });
  }
});

module.exports = router; 