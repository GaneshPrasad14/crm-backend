const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

router.get('/', async (req, res) => {
  try {
    const data = await Notification.getAllNotifications();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await Notification.getNotificationById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await Notification.createNotification(req.body);
    res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await Notification.updateNotification(req.params.id, req.body);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification updated successfully' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Notification.deleteNotification(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/count', (req, res) => {
  res.json({ success: true, total: 2 });
});

module.exports = router;