const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const { body, validationResult, query } = require('express-validator');

// GET /api/deals with pagination, filtering, and search
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
      const stage = req.query.stage || '';
      const sort = req.query.sort || 'created_at';
      const order = req.query.order || 'desc';
      const [data, total] = await Promise.all([
        Deal.getDealsPaginated(limit, offset, search, stage, sort, order),
        Deal.getDealsCount(search, stage)
      ]);
      res.json({ success: true, data, total, page, limit });
    } catch (error) {
      console.error('[DEAL GET ALL ERROR]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Move this route above /:id
router.get('/count', async (req, res) => {
  try {
    const total = await Deal.getDealsCount();
    res.json({ success: true, total });
  } catch (error) {
    console.error('[DEAL COUNT ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await Deal.getDealById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Deal not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[DEAL GET BY ID ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/',
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('customer_id').notEmpty().withMessage('Customer is required'),
    body('stage').notEmpty().withMessage('Stage is required'),
    body('amount').isNumeric().withMessage('Amount must be a number')
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
      const deal = await Deal.createDeal(req.body);
      res.status(201).json(deal);
    } catch (error) {
      console.error('[DEAL CREATE ERROR]', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.put('/:id',
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('customer_id').notEmpty().withMessage('Customer is required'),
    body('stage').notEmpty().withMessage('Stage is required'),
    body('amount').isNumeric().withMessage('Amount must be a number')
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
      const deal = await Deal.updateDeal(req.params.id, req.body);
      res.json(deal);
    } catch (error) {
      console.error('[DEAL UPDATE ERROR]', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete('/:id', async (req, res) => {
  try {
    const result = await Deal.deleteDeal(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Deal not found' });
    res.json({ success: true, message: 'Deal deleted successfully' });
  } catch (error) {
    console.error('[DEAL DELETE ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;