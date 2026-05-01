/**
 * TrashDash — Booking Controller
 */

const { pool, nextBookingId } = require('../config/database');

// ── GET /api/bookings ────────────────────────────────────────
async function getAll(req, res) {
  try {
    let rows;
    if (req.user.role === 'admin') {
      [rows] = await pool.execute(`
        SELECT b.*, w.name AS workerName
        FROM bookings b
        LEFT JOIN workers w ON b.workerId = w.id
        ORDER BY b.createdAt DESC
      `);
    } else {
      [rows] = await pool.execute(`
        SELECT b.*, w.name AS workerName
        FROM bookings b
        LEFT JOIN workers w ON b.workerId = w.id
        WHERE b.userId = ?
        ORDER BY b.createdAt DESC
      `, [req.user.id]);
    }
    // Parse wasteTypes JSON if it came back as string
    rows = rows.map(normaliseBooking);
    res.json({ success: true, bookings: rows });
  } catch (err) {
    console.error('[bookings/getAll]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── GET /api/bookings/stats ──────────────────────────────────
async function getStats(req, res) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [[{ totalUsers }]]     = await pool.execute('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ activeWorkers }]]  = await pool.execute("SELECT COUNT(*) AS activeWorkers FROM workers WHERE status = 'Active'");
    const [[{ pendingBookings }]]= await pool.execute("SELECT COUNT(*) AS pendingBookings FROM bookings WHERE status = 'Pending'");
    const [[{ todayBookings }]]  = await pool.execute('SELECT COUNT(*) AS todayBookings FROM bookings WHERE date = ?', [today]);
    const [[{ completed, total }]] = await pool.execute(
      "SELECT SUM(status='Completed') AS completed, COUNT(*) AS total FROM bookings"
    );
    const [[{ avgRating }]] = await pool.execute(
      'SELECT AVG(rating) AS avgRating FROM bookings WHERE rating IS NOT NULL'
    );

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeWorkers,
        pendingBookings,
        todayBookings,
        completionRate,
        avgRating: avgRating ? parseFloat(avgRating).toFixed(1) : 0,
      },
    });
  } catch (err) {
    console.error('[bookings/getStats]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── POST /api/bookings ───────────────────────────────────────
async function create(req, res) {
  const { wasteTypes, date, timeSlot, recurrence, notes } = req.body;

  if (!wasteTypes || !wasteTypes.length) {
    return res.status(400).json({ success: false, message: 'At least one waste type is required.' });
  }
  if (!date) {
    return res.status(400).json({ success: false, message: 'Date is required.' });
  }

  try {
    // Get user's zone from their address
    const [userRows] = await pool.execute('SELECT name, address FROM users WHERE id = ?', [req.user.id]);
    if (!userRows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = userRows[0];
    const newId = await nextBookingId();

    await pool.execute(
      `INSERT INTO bookings (id, userId, userName, zone, wasteTypes, date, timeSlot, recurrence, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [
        newId,
        req.user.id,
        user.name,
        user.address || '',
        JSON.stringify(Array.isArray(wasteTypes) ? wasteTypes : [wasteTypes]),
        date,
        timeSlot || '',
        recurrence || 'One-time',
        notes || '',
      ]
    );

    const [newRows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [newId]);
    res.status(201).json({ success: true, booking: normaliseBooking(newRows[0]) });
  } catch (err) {
    console.error('[bookings/create]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── PATCH /api/bookings/:id/status ──────────────────────────
async function updateStatus(req, res) {
  const { id } = req.params;
  const { status, workerId, rating } = req.body;

  try {
    const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const booking = rows[0];

    // Residents can only cancel their own pending bookings
    if (req.user.role !== 'admin') {
      if (booking.userId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      if (status !== 'Cancelled') {
        return res.status(403).json({ success: false, message: 'Residents can only cancel bookings.' });
      }
    }

    // Update booking status
    const fields = ['status = ?'];
    const values = [status];

    if (workerId !== undefined) { fields.push('workerId = ?'); values.push(workerId || null); }
    if (rating   !== undefined) { fields.push('rating = ?');   values.push(rating   || null); }
    values.push(id);

    await pool.execute(`UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`, values);

    // Side effects on completion
    if (status === 'Completed' && booking.status !== 'Completed') {
      // Decrement worker's assignedBookings
      if (booking.workerId) {
        await pool.execute(
          'UPDATE workers SET assignedBookings = GREATEST(assignedBookings - 1, 0) WHERE id = ?',
          [booking.workerId]
        );
      }
      // Increment user's totalBookings
      await pool.execute(
        'UPDATE users SET totalBookings = totalBookings + 1 WHERE id = ?',
        [booking.userId]
      );
    }

    const [updated] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
    res.json({ success: true, booking: normaliseBooking(updated[0]) });
  } catch (err) {
    console.error('[bookings/updateStatus]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── POST /api/bookings/:id/assign ────────────────────────────
async function assignWorker(req, res) {
  const { id } = req.params;
  const { workerId } = req.body;

  if (!workerId) return res.status(400).json({ success: false, message: 'workerId is required.' });

  try {
    const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const booking = rows[0];

    // If already assigned to someone else, decrement old worker
    if (booking.workerId && booking.workerId !== workerId) {
      await pool.execute(
        'UPDATE workers SET assignedBookings = GREATEST(assignedBookings - 1, 0) WHERE id = ?',
        [booking.workerId]
      );
    }

    // Assign new worker
    await pool.execute(
      "UPDATE bookings SET workerId = ?, status = 'Assigned' WHERE id = ?",
      [workerId, id]
    );

    // Increment new worker's count (only if not already assigned to same worker)
    if (booking.workerId !== workerId) {
      await pool.execute(
        'UPDATE workers SET assignedBookings = assignedBookings + 1 WHERE id = ?',
        [workerId]
      );
    }

    const [updated] = await pool.execute(`
      SELECT b.*, w.name AS workerName
      FROM bookings b LEFT JOIN workers w ON b.workerId = w.id
      WHERE b.id = ?
    `, [id]);

    res.json({ success: true, booking: normaliseBooking(updated[0]) });
  } catch (err) {
    console.error('[bookings/assignWorker]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── DELETE /api/bookings/:id ─────────────────────────────────
async function remove(req, res) {
  const { id } = req.params;

  try {
    const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const booking = rows[0];

    // Residents can only delete their own pending bookings
    if (req.user.role !== 'admin') {
      if (booking.userId !== req.user.id || booking.status !== 'Pending') {
        return res.status(403).json({ success: false, message: 'Cannot delete this booking.' });
      }
    }

    // Decrement worker count if assigned
    if (booking.workerId && booking.status === 'Assigned') {
      await pool.execute(
        'UPDATE workers SET assignedBookings = GREATEST(assignedBookings - 1, 0) WHERE id = ?',
        [booking.workerId]
      );
    }

    await pool.execute('DELETE FROM bookings WHERE id = ?', [id]);
    res.json({ success: true, message: 'Booking deleted.' });
  } catch (err) {
    console.error('[bookings/remove]', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── Helper ───────────────────────────────────────────────────
function normaliseBooking(b) {
  if (!b) return b;
  // Ensure wasteTypes is always an array
  if (typeof b.wasteTypes === 'string') {
    try { b.wasteTypes = JSON.parse(b.wasteTypes); } catch { b.wasteTypes = [b.wasteTypes]; }
  }
  if (!Array.isArray(b.wasteTypes)) b.wasteTypes = [b.wasteTypes || 'Household'];
  // Normalise date to YYYY-MM-DD string
  if (b.date instanceof Date) b.date = b.date.toISOString().slice(0, 10);
  return b;
}

module.exports = { getAll, getStats, create, updateStatus, assignWorker, remove };