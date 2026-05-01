/**
 * TrashDash — User Controller
 */

const bcrypt = require('bcryptjs');
const { pool, nextUserId } = require('../config/database');

// ── GET /api/users ───────────────────────────────────────────
async function getAll(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, address, totalBookings, rating, memberSince, status FROM users ORDER BY createdAt DESC'
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    console.error('[users/getAll]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── GET /api/users/:id ───────────────────────────────────────
async function getOne(req, res) {
  const { id } = req.params;

  // Residents can only view their own profile
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, address, totalBookings, rating, memberSince, status FROM users WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('[users/getOne]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── PUT /api/users/:id ───────────────────────────────────────
async function update(req, res) {
  const { id } = req.params;
  const { name, phone, address, status, rating } = req.body;

  // Residents can only update their own profile
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const fields = [];
    const values = [];

    if (name    !== undefined) { fields.push('name = ?');    values.push(name.trim()); }
    if (phone   !== undefined) { fields.push('phone = ?');   values.push(phone); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address); }
    // Admin-only fields
    if (req.user.role === 'admin') {
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      if (rating !== undefined) { fields.push('rating = ?'); values.push(rating); }
    }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    values.push(id);
    await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, address, totalBookings, rating, memberSince, status FROM users WHERE id = ?',
      [id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('[users/update]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── POST /api/users ──────────────────────────────────────────
async function create(req, res) {
  const { name, email, phone, address, password = 'password123' } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required.' });
  }

  try {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }

    const newId = await nextUserId();
    const hashedPw = await bcrypt.hash(password, 10);
    const memberSince = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    await pool.execute(
      `INSERT INTO users (id, name, email, password, phone, address, memberSince)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, name.trim(), email.toLowerCase().trim(), hashedPw, phone || '', address || '', memberSince]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, address, totalBookings, rating, memberSince, status FROM users WHERE id = ?',
      [newId]
    );
    res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('[users/create]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── DELETE /api/users/:id ────────────────────────────────────
async function remove(req, res) {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('[users/remove]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, getOne, update, create, remove };