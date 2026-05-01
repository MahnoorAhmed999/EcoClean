/**
 * TrashDash — Worker Controller
 */

const { pool, nextWorkerId } = require('../config/database');

async function getAll(req, res) {
  try {
    const [rows] = await pool.execute('SELECT * FROM workers ORDER BY id ASC');
    res.json({ success: true, workers: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function create(req, res) {
  const { name, zone, phone } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });

  try {
    const newId = await nextWorkerId();
    await pool.execute(
      'INSERT INTO workers (id, name, zone, phone) VALUES (?, ?, ?, ?)',
      [newId, name.trim(), zone || '', phone || '']
    );
    const [rows] = await pool.execute('SELECT * FROM workers WHERE id = ?', [newId]);
    res.status(201).json({ success: true, worker: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function update(req, res) {
  const { id } = req.params;
  const { name, zone, phone, status } = req.body;

  try {
    const fields = [];
    const values = [];
    if (name   !== undefined) { fields.push('name = ?');   values.push(name.trim()); }
    if (zone   !== undefined) { fields.push('zone = ?');   values.push(zone); }
    if (phone  !== undefined) { fields.push('phone = ?');  values.push(phone); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }

    if (!fields.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    values.push(id);
    await pool.execute(`UPDATE workers SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.execute('SELECT * FROM workers WHERE id = ?', [id]);
    res.json({ success: true, worker: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM workers WHERE id = ?', [id]);
    res.json({ success: true, message: 'Worker deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, create, update, remove };