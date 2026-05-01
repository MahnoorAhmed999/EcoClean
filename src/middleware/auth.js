/**
 * TrashDash — JWT Auth Middleware
 * Verifies Bearer token from Authorization header.
 * Attaches req.user = { id, role, email } on success.
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'trashdash_secret_key_change_this';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };