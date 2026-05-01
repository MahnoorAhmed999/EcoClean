require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(morgan('dev'));

// Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/bookings', require('./src/routes/bookings'));
app.use('/api/users',    require('./src/routes/users'));
app.use('/api/workers',  require('./src/routes/workers'));

// Health check
app.get('/api/health', (req, res) => res.json({ success: true, service: 'TrashDash API', db: 'Aiven MySQL', ts: new Date().toISOString() }));

// Global error handler (catches async errors from all routes)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Server error.' : err.message });
});

module.exports = app;
