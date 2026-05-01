/**
 * TrashDash — Auth Controller
 * Handles login for residents + admin, and registration.
 *
 * Password handling:
 *   - Bcrypt hashes (start with $2a$ or $2b$): compared with bcrypt.compare()
 *   - Plain text passwords: compared directly with ===
 *   This lets old users (plain text) and new users (bcrypt) both log in.
 */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool, nextUserId } = require('../config/database');

const JWT_SECRET  = process.env.JWT_SECRET || 'trashdash_secret_key_change_this';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// ── Helper: compare password (handles both plain text and bcrypt) ────
async function checkPassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;
  // Bcrypt hashes always start with $2a$ or $2b$
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
    return bcrypt.compare(inputPassword, storedPassword);
  }
  // Plain text comparison for legacy/seed accounts
  return inputPassword === storedPassword;
}

// ── POST /api/auth/login ─────────────────────────────────────────────
async function login(req, res) {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    if (role === 'admin') {
      // Check admins table
      const [rows] = await pool.execute(
        'SELECT * FROM admins WHERE email = ?', [email.toLowerCase().trim()]
      );
      if (!rows.length) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
      }
      const admin = rows[0];
      const valid = await checkPassword(password, admin.password);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
      }
      const token = jwt.sign(
        { id: admin.id, role: 'admin', email: admin.email },
        JWT_SECRET, { expiresIn: JWT_EXPIRES }
      );
      return res.json({
        success: true,
        token,
        user: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' },
      });

    } else {
      // Check users (residents) table
      const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]
      );
      if (!rows.length) {
        return res.status(401).json({ success: false, message: 'No account found with this email.' });
      }
      const user = rows[0];
      const valid = await checkPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
      }
      const token = jwt.sign(
        { id: user.id, role: 'resident', email: user.email },
        JWT_SECRET, { expiresIn: JWT_EXPIRES }
      );
      return res.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, role: 'resident' },
      });
    }
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
}

// ── POST /api/auth/register ──────────────────────────────────────────
async function register(req, res) {
  const { name, email, password, phone, address } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
  }

  try {
    // Check if email already taken
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Hash password
    const hashedPw = await bcrypt.hash(password, 10);

    // Generate next user ID
    const newId = await nextUserId();

    // Build memberSince string like "Apr 2026"
    const now = new Date();
    const memberSince = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Insert new user
    await pool.execute(
      `INSERT INTO users (id, name, email, password, phone, address, totalBookings, rating, memberSince, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0.0, ?, 'Active')`,
      [newId, name.trim(), email.toLowerCase().trim(), hashedPw, phone || '', address || '', memberSince]
    );

    // Issue JWT (logs user in immediately)
    const token = jwt.sign(
      { id: newId, role: 'resident', email: email.toLowerCase().trim() },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );

    return res.status(201).json({
      success: true,
      token,
      user: { id: newId, name: name.trim(), email: email.toLowerCase().trim(), role: 'resident' },
    });

  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
}

module.exports = { login, register };