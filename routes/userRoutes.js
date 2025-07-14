const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');

router.get('/', async (req, res) => {
  try {
    const data = await User.getAllUsers();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await User.getUserById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Secure user creation: only admin, hash password
router.post('/', auth, roles('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }
    // CORRECT: pass individual arguments
    const result = await User.createUser(name, email, password, role || 'user');
    res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await User.updateUser(req.params.id, req.body);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await User.deleteUser(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// router.get('/profile', (req, res) => {
//   res.json({ success: true, data: { id: 1, name: 'Demo User', email: 'demo@example.com', role: 'admin' } });
// });

// router.get('/notifications', (req, res) => {
//   res.json({ success: true, data: [
//     { id: 1, message: 'Welcome to the CRM!', read: false },
//     { id: 2, message: 'You have a new task assigned.', read: false }
//   ] });
// });

// router.get('/sidebar', (req, res) => {
//   res.json({ success: true, data: { menu: ['Dashboard', 'CRM', 'Settings', 'Video Call'] } });
// });

router.get('/sidebar/badges', (req, res) => {
  res.json({ success: true, data: { notifications: 2, tasks: 5 } });
});

module.exports = router;