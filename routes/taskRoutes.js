const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { body, validationResult, query } = require('express-validator');
const { io } = require('../index');

// GET /api/tasks with pagination, filtering, and search
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
      const sort = req.query.sort || 'due_date';
      const order = req.query.order || 'asc';
      const [tasks, total] = await Promise.all([
        Task.getTasksPaginated(limit, offset, search, status, sort, order),
        Task.getTasksCount(search, status)
      ]);
      res.json({ success: true, data: tasks, total, page, limit });
    } catch (error) {
      console.error('[TASK GET ALL ERROR]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Specific GET routes must come before '/:id'
router.get('/count-by-status', async (req, res) => {
  try {
    const { rows } = await require('../db').query(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );
    // Ensure all statuses are present (underscore style)
    const statusCounts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    rows.forEach(row => {
      statusCounts[row.status] = parseInt(row.count, 10);
    });
    res.json({ success: true, ...statusCounts });
  } catch (error) {
    console.error('[TASK COUNT BY STATUS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/count', async (req, res) => {
  try {
    const total = await Task.getTasksCount('', '');
    res.json({ success: true, total });
  } catch (error) {
    console.error('[TASK COUNT ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// '/:id' route must come after all static GET routes
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[TASK GET BY ID ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/',
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('status').notEmpty().withMessage('Status is required'),
    body('due_date').notEmpty().withMessage('Due date is required')
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
      const task = await Task.createTask(req.body);
      res.status(201).json(task);
    } catch (error) {
      console.error('[TASK CREATE ERROR]', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.put('/:id',
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('status').notEmpty().withMessage('Status is required'),
    body('due_date').notEmpty().withMessage('Due date is required')
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
      const task = await Task.updateTask(req.params.id, req.body);
      // Emit real-time event if task is completed
      if (req.body.status === 'completed') {
        io.emit('taskCompleted', { taskId: req.params.id, userId: task.owner_id });
      }
      // Emit real-time event for all status changes
      const { rows } = await require('../db').query(
        `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
      );
      const statusCounts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
      rows.forEach(row => {
        statusCounts[row.status] = parseInt(row.count, 10);
      });
      io.emit('taskStatusCountsUpdated', statusCounts);
      res.json(task);
    } catch (error) {
      console.error('[TASK UPDATE ERROR]', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete('/:id', async (req, res) => {
  try {
    const result = await Task.deleteTask(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('[TASK DELETE ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;