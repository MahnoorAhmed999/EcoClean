// src/routes/workers.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const workerController = require('../controllers/workerController');

router.get('/',       requireAuth,  workerController.getAll);   // ← requireAuth not requireAdmin
router.post('/',      requireAdmin, workerController.create);
router.put('/:id',    requireAdmin, workerController.update);
router.delete('/:id', requireAdmin, workerController.remove);

module.exports = router;