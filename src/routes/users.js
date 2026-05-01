// src/routes/users.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/',       requireAdmin, userController.getAll);
router.get('/:id',    requireAuth,  userController.getOne);    // ← requireAuth
router.put('/:id',    requireAuth,  userController.update);    // ← requireAuth
router.post('/',      requireAdmin, userController.create);
router.delete('/:id', requireAdmin, userController.remove);

module.exports = router;