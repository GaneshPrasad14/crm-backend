const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');

router.get('/', async (req, res) => {
  try {
    const data = await Invoice.getAllInvoices();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await Invoice.getInvoiceById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await Invoice.createInvoice(req.body);
    res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await Invoice.updateInvoice(req.params.id, req.body);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice updated successfully' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Invoice.deleteInvoice(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/count', (req, res) => {
  res.json({ success: true, total: 4 });
});

module.exports = router;