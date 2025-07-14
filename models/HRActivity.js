const mongoose = require('mongoose');

const HRActivitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String },
  date: { type: Date, required: true }
});

module.exports = mongoose.model('HRActivity', HRActivitySchema); 