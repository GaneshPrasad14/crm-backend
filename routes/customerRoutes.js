const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { body, validationResult, query } = require('express-validator');

// GET /api/customers with pagination, filtering, and search
router.get('/',
  [
    query('sort').optional().isString(),
    query('order').optional().isIn(['asc', 'desc'])
  ],
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const search = req.query.search || '';
      const status = req.query.status || '';
      const sort = req.query.sort || 'created_at';
      const order = req.query.order || 'desc';
      const [data, total] = await Promise.all([
        Customer.getCustomersPaginated(limit, offset, search, status, sort, order),
        Customer.getCustomersCount(search, status)
      ]);
      res.json({ success: true, data, total, page, limit });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/:id', async (req, res) => {
  try {
    const data = await Customer.getCustomerById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('status').notEmpty().withMessage('Status is required')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  async (req, res) => {
    try {
      const result = await Customer.createCustomer(req.body);
      res.status(201).json({ success: true, id: result.id });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message, details: error });
    }
  }
);

router.put('/:id',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('status').notEmpty().withMessage('Status is required')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  async (req, res) => {
    try {
      const result = await Customer.updateCustomer(req.params.id, req.body);
      if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Customer not found' });
      res.json({ success: true, message: 'Customer updated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.delete('/:id', async (req, res) => {
  try {
    const result = await Customer.deleteCustomer(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/count', async (req, res) => {
  try {
    const total = await Customer.getCustomersCount('', '');
    res.json({ success: true, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;