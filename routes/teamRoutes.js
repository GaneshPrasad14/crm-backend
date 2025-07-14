const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const bcrypt = require('bcryptjs');

// GET /api/team - Get all team members (All authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, email, role, status, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[TEAM GET ALL ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/team/stats/overview - Get team statistics (All authenticated users)
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_members,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_members,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_members,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
        COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_count,
        COUNT(CASE WHEN role = 'sales' THEN 1 END) as sales_count,
        COUNT(CASE WHEN role = 'developer' THEN 1 END) as developer_count
      FROM users
    `);

    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    console.error('[TEAM STATS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/team/:id - Get team member by ID (Admin only)
router.get('/:id', auth, roles('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, status, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('[TEAM GET BY ID ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/team - Add new team member (Admin only)
router.post('/', auth, roles('admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').isIn(['admin', 'sales', 'manager', 'developer']).withMessage('Valid role is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  },
  async (req, res) => {
    try {
      const { name, email, role, password } = req.body;
      
      // Check if email already exists
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }

      // Hash password using bcrypt
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const { rows } = await pool.query(
        'INSERT INTO users (name, email, password, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, status, created_at',
        [name, email, hashedPassword, role, 'active']
      );
      
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      console.error('[TEAM CREATE ERROR]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// PUT /api/team/:id - Update team member (Admin only)
router.put('/:id', auth, roles('admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').isIn(['admin', 'sales', 'manager', 'developer']).withMessage('Valid role is required'),
    body('status').isIn(['active', 'inactive']).withMessage('Valid status is required')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  },
  async (req, res) => {
    try {
      const { name, email, role, status } = req.body;
      const userId = req.params.id;
      
      // Check if email already exists for other users
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2', 
        [email, userId]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }

      const { rows } = await pool.query(
        'UPDATE users SET name = $1, email = $2, role = $3, status = $4 WHERE id = $5 RETURNING id, name, email, role, status, created_at',
        [name, email, role, status, userId]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Team member not found' });
      }
      
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      console.error('[TEAM UPDATE ERROR]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/team/:id - Delete team member (Admin only)
router.delete('/:id', auth, roles('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }
    res.json({ success: true, message: 'Team member deleted successfully' });
  } catch (error) {
    console.error('[TEAM DELETE ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router; 