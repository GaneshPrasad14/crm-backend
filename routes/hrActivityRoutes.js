const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Set up multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// CREATE HR Activity
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, description, date, type } = req.body;
    const image = req.file ? req.file.filename : null;
    const result = await pool.query(
      'INSERT INTO hr_activities (title, description, image, date, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, description, image, date, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// READ all HR Activities
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hr_activities ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ single HR Activity
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hr_activities WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE HR Activity
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { title, description, date, type } = req.body;
    let image = req.file ? req.file.filename : null;
    // If no new image, keep the old one
    if (!image) {
      const old = await pool.query('SELECT image FROM hr_activities WHERE id = $1', [req.params.id]);
      image = old.rows[0]?.image || null;
    }
    const result = await pool.query(
      'UPDATE hr_activities SET title=$1, description=$2, image=$3, date=$4, type=$5 WHERE id=$6 RETURNING *',
      [title, description, image, date, type, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE HR Activity
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM hr_activities WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 