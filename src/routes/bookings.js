// src/routes/bookings.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const bookingController = require('../controllers/bookingController');

router.get('/stats',    requireAuth,  bookingController.getStats);
router.get('/',         requireAuth,  bookingController.getAll);     // ← requireAuth
router.post('/',        requireAuth,  bookingController.create);
router.patch('/:id/status', requireAuth,  bookingController.updateStatus);
router.post('/:id/assign',  requireAdmin, bookingController.assignWorker);
router.delete('/:id',   requireAuth,  bookingController.remove);

module.exports = router;