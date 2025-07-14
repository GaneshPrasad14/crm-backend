const express = require('express');
const router = express.Router();
const {
  getAttachmentsByTaskId,
  createAttachment,
  deleteAttachment
} = require('../models/Attachment');

router.get('/task/:taskId', async (req, res) => {
  try {
    const attachments = await getAttachmentsByTaskId(req.params.taskId);
    res.json({ success: true, data: attachments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newAttachment = await createAttachment(req.body);
    res.status(201).json({ success: true, data: newAttachment });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteAttachment(req.params.id);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/count', (req, res) => {
  res.json({ success: true, total: 3 });
});

module.exports = router;
