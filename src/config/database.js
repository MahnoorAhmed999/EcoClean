// ============================================================
//  TrashDash — Database Configuration
//  Connects to Aiven MySQL via connection pool.
//  Exports: pool, testConnection, createTables, seedData
// ============================================================

require('dotenv').config();
const mysql = require('mysql2/promise');

// ── Connection Pool ──────────────────────────────────────────
// A pool keeps several connections open and reuses them,
// which is much faster than opening a new connection per request.
const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,       // max simultaneous connections
  queueLimit:         0,        // unlimited queued requests
  // Aiven requires SSL — rejectUnauthorized: false accepts their self-signed cert.
  // If you downloaded the Aiven CA certificate, set: ca: fs.readFileSync('ca.pem')
  ssl: {
    rejectUnauthorized: false,
  },
  // Return JS Date objects for DATE/DATETIME columns, not raw strings
  dateStrings: false,
  // Automatically parse JSON columns into JS objects
  typeCast: function (field, next) {
    if (field.type === 'JSON') {
      const val = field.string();
      try { return JSON.parse(val); } catch { return val; }
    }
    return next();
  },
});

// ── Test Connection ──────────────────────────────────────────
// Called once during server startup. Exits process if it fails
// so you know immediately if your .env credentials are wrong.
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('    ✅ Aiven MySQL connected successfully');
    conn.release();
  } catch (err) {
    console.error('    ❌ Database connection failed:', err.message);
    console.error('    Check your .env DB_HOST / DB_USER / DB_PASSWORD / DB_NAME');
    process.exit(1);
  }
}

// ── Create Tables ────────────────────────────────────────────
// Uses CREATE TABLE IF NOT EXISTS so it is safe to call on every
// server start — it will never overwrite existing data.
async function createTables() {
  const conn = await pool.getConnection();
  try {
    // ── admins ────────────────────────────────────────────────
    // Separate table for admin credentials so admins can never
    // be confused with regular residents.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(255)        NOT NULL DEFAULT 'Admin',
        email       VARCHAR(255) UNIQUE NOT NULL,
        password    VARCHAR(255)        NOT NULL,
        createdAt   TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ── users (residents) ─────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id            VARCHAR(20)  PRIMARY KEY,        -- e.g. "U-001"
        name          VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password      VARCHAR(255) NOT NULL,
        phone         VARCHAR(50),
        address       VARCHAR(500),
        totalBookings INT          NOT NULL DEFAULT 0,
        rating        DECIMAL(3,1) NOT NULL DEFAULT 0.0,
        memberSince   VARCHAR(20),                     -- e.g. "Jan 2025"
        status        ENUM('Active','Inactive')        DEFAULT 'Active',
        createdAt     TIMESTAMP                        DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ── workers ───────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workers (
        id               VARCHAR(20)  PRIMARY KEY,     -- e.g. "W-001"
        name             VARCHAR(255) NOT NULL,
        zone             VARCHAR(255),
        phone            VARCHAR(50),
        status           ENUM('Active','Inactive')     DEFAULT 'Active',
        assignedBookings INT          NOT NULL DEFAULT 0,
        createdAt        TIMESTAMP                     DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ── bookings ──────────────────────────────────────────────
    // wasteTypes is a JSON column — stores an array like:
    //   ["Household", "Recyclable", "Organic"]
    // This is the KEY difference from the old localStorage schema
    // which stored a single string in wasteType.
    //
    // Foreign keys use ON DELETE CASCADE / SET NULL so that:
    //   - Deleting a user removes all their bookings
    //   - Deleting a worker sets workerId to NULL (bookings remain)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id          VARCHAR(20)  PRIMARY KEY,           -- e.g. "B-001"
        userId      VARCHAR(20)  NOT NULL,
        userName    VARCHAR(255),
        zone        VARCHAR(500),
        wasteTypes  JSON         NOT NULL,              -- ARRAY of waste type strings
        date        DATE         NOT NULL,
        timeSlot    VARCHAR(50),
        recurrence  VARCHAR(50)  DEFAULT 'One-time',
        status      ENUM('Pending','Assigned','Completed','Cancelled') DEFAULT 'Pending',
        workerId    VARCHAR(20)  DEFAULT NULL,
        notes       TEXT,
        rating      TINYINT      DEFAULT NULL,          -- 1-5 star rating from resident
        createdAt   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_booking_user
          FOREIGN KEY (userId)   REFERENCES users(id)   ON DELETE CASCADE,
        CONSTRAINT fk_booking_worker
          FOREIGN KEY (workerId) REFERENCES workers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('    ✅ Tables verified (admins, users, workers, bookings)');
  } finally {
    conn.release();
  }
}

// ── Seed Data ────────────────────────────────────────────────
// Inserts demo data ONLY when each table is completely empty.
// This means: re-running the server never overwrites real data.
// Order matters: users and workers must exist before bookings
// (because of the foreign key constraints).
async function seedData() {
  const conn = await pool.getConnection();
  try {

    // ── Seed Admins ───────────────────────────────────────────
    const [adminRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM admins');
    if (adminRows[0].cnt === 0) {
      await conn.execute(`
        INSERT INTO admins (name, email, password) VALUES
        ('TrashDash Admin', 'admin@waste.pk', 'admin123')
      `);
      console.log('    ✅ Seeded: 1 admin');
    }

    // ── Seed Workers ──────────────────────────────────────────
    // Workers are seeded BEFORE users because bookings reference
    // workers, and users come before bookings.
    const [workerRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM workers');
    if (workerRows[0].cnt === 0) {
      await conn.execute(`
        INSERT INTO workers (id, name, zone, phone, status, assignedBookings) VALUES
        ('W-001', 'Muhammad Akram', 'Satellite Town',  '+92-311-1234567', 'Active',   2),
        ('W-002', 'Kashif Mahmood', 'Satellite Town',  '+92-322-2345678', 'Active',   0),
        ('W-003', 'Tariq Hussain',  'Bahria Town',     '+92-333-3456789', 'Active',   1),
        ('W-004', 'Imran Butt',     'Gulraiz Housing', '+92-344-4567890', 'Inactive', 0),
        ('W-005', 'Zubair Shah',    'Chaklala',        '+92-355-5678901', 'Active',   2),
        ('W-006', 'Asif Raza',      'Pir Wadhai',      '+92-366-6789012', 'Active',   1)
      `);
      console.log('    ✅ Seeded: 6 workers');
    }

    // ── Seed Users ────────────────────────────────────────────
    const [userRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM users');
    if (userRows[0].cnt === 0) {
      // Passwords are stored as plain text here to match the existing
      // api-bridge.js which sends passwords as-is to the server.
      // You can switch to bcrypt hashing at any time — just update
      // authController.js to use bcrypt.compare() instead of ===.
      await conn.execute(`
        INSERT INTO users
          (id, name, email, password, phone, address, totalBookings, rating, memberSince, status)
        VALUES
          ('U-001','Ahmed Hassan', 'ahmed@example.com',  'password123', '+92-300-1234567', 'Satellite Town, Rawalpindi',  24, 4.8, 'Jan 2025', 'Active'),
          ('U-002','Sara Khan',    'sara@example.com',   'password123', '+92-301-2345678', 'Bahria Town, Rawalpindi',     15, 4.5, 'Feb 2025', 'Active'),
          ('U-003','Ali Raza',     'ali@example.com',    'password123', '+92-302-3456789', 'Gulraiz Housing, Rawalpindi',  3, 4.2, 'Mar 2025', 'Active'),
          ('U-004','Fatima Malik', 'fatima@example.com', 'password123', '+92-303-4567890', 'Chaklala, Rawalpindi',        12, 4.9, 'Jan 2025', 'Active'),
          ('U-005','Usman Tariq',  'usman@example.com',  'password123', '+92-304-5678901', 'Satellite Town, Rawalpindi',   8, 4.0, 'Apr 2025', 'Active'),
          ('U-006','Zara Iqbal',   'zara@example.com',   'password123', '+92-305-6789012', 'Pir Wadhai, Rawalpindi',      18, 4.7, 'Jan 2025', 'Active'),
          ('U-007','Hassan Mirza', 'hassan@example.com', 'password123', '+92-306-7890123', 'Bahria Town, Rawalpindi',      6, 3.8, 'May 2025', 'Inactive')
      `);
      console.log('    ✅ Seeded: 7 users');
    }

    // ── Seed Bookings ─────────────────────────────────────────
    // KEY CHANGE: wasteType (single string) → wasteTypes (JSON array).
    // Every old single value is wrapped in an array: 'Household' → '["Household"]'
    // This is backward-compatible — the frontend just reads wasteTypes[0] for
    // single-type bookings, and displays the full array for multi-type ones.
    const [bookingRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM bookings');
    if (bookingRows[0].cnt === 0) {
      // Use individual inserts with JSON.stringify so the JSON column is
      // correctly formatted even if the mysql2 driver varies by version.
      const SEED_BOOKINGS = [
        { id:'B-001', userId:'U-001', userName:'Ahmed Hassan', zone:'Satellite Town, Rawalpindi',  wasteTypes:['Household'],  date:'2026-03-18', timeSlot:'08:00 - 10:00', recurrence:'Weekly',   status:'Completed', workerId:'W-001', notes:'Please collect from the back gate',    rating:5    },
        { id:'B-002', userId:'U-001', userName:'Ahmed Hassan', zone:'Satellite Town, Rawalpindi',  wasteTypes:['Electronic'], date:'2026-03-15', timeSlot:'08:00 - 10:00', recurrence:'One-time', status:'Completed', workerId:'W-002', notes:'Old computer parts',                   rating:5    },
        { id:'B-003', userId:'U-001', userName:'Ahmed Hassan', zone:'Satellite Town, Rawalpindi',  wasteTypes:['Recyclable'], date:'2026-03-22', timeSlot:'08:00 - 10:00', recurrence:'Weekly',   status:'Pending',   workerId:null,    notes:'Plastic bottles and glass containers', rating:null },
        { id:'B-004', userId:'U-001', userName:'Ahmed Hassan', zone:'Satellite Town, Rawalpindi',  wasteTypes:['Organic'],    date:'2026-03-25', timeSlot:'10:00 - 12:00', recurrence:'Monthly',  status:'Assigned',  workerId:'W-001', notes:'Garden waste and food compost',        rating:null },
        { id:'B-005', userId:'U-002', userName:'Sara Khan',    zone:'Bahria Town, Rawalpindi',     wasteTypes:['Household'],  date:'2026-03-20', timeSlot:'10:00 - 12:00', recurrence:'Weekly',   status:'Assigned',  workerId:'W-003', notes:'',                                    rating:null },
        { id:'B-006', userId:'U-002', userName:'Sara Khan',    zone:'Bahria Town, Rawalpindi',     wasteTypes:['Recyclable'], date:'2026-03-27', timeSlot:'14:00 - 16:00', recurrence:'Weekly',   status:'Pending',   workerId:null,    notes:'Cardboard boxes',                     rating:null },
        { id:'B-007', userId:'U-003', userName:'Ali Raza',     zone:'Gulraiz Housing, Rawalpindi', wasteTypes:['Organic'],    date:'2026-04-01', timeSlot:'08:00 - 10:00', recurrence:'One-time', status:'Pending',   workerId:null,    notes:'',                                    rating:null },
        { id:'B-008', userId:'U-004', userName:'Fatima Malik', zone:'Chaklala, Rawalpindi',        wasteTypes:['Electronic'], date:'2026-03-19', timeSlot:'12:00 - 14:00', recurrence:'One-time', status:'Completed', workerId:'W-005', notes:'Old mobile phones',                   rating:5    },
        { id:'B-009', userId:'U-004', userName:'Fatima Malik', zone:'Chaklala, Rawalpindi',        wasteTypes:['Household'],  date:'2026-03-26', timeSlot:'08:00 - 10:00', recurrence:'Weekly',   status:'Assigned',  workerId:'W-005', notes:'',                                    rating:null },
        { id:'B-010', userId:'U-005', userName:'Usman Tariq',  zone:'Satellite Town, Rawalpindi',  wasteTypes:['Hazardous'],  date:'2026-03-21', timeSlot:'16:00 - 18:00', recurrence:'One-time', status:'Pending',   workerId:null,    notes:'Old paint cans and batteries',        rating:null },
        { id:'B-011', userId:'U-006', userName:'Zara Iqbal',   zone:'Pir Wadhai, Rawalpindi',      wasteTypes:['Household'],  date:'2026-03-23', timeSlot:'10:00 - 12:00', recurrence:'Weekly',   status:'Assigned',  workerId:'W-006', notes:'',                                    rating:null },
        { id:'B-012', userId:'U-006', userName:'Zara Iqbal',   zone:'Pir Wadhai, Rawalpindi',      wasteTypes:['Recyclable'], date:'2026-04-06', timeSlot:'10:00 - 12:00', recurrence:'Weekly',   status:'Pending',   workerId:null,    notes:'',                                    rating:null },
        { id:'B-013', userId:'U-007', userName:'Hassan Mirza', zone:'Bahria Town, Rawalpindi',     wasteTypes:['Organic'],    date:'2026-03-28', timeSlot:'08:00 - 10:00', recurrence:'One-time', status:'Cancelled', workerId:null,    notes:'',                                    rating:null },
        { id:'B-014', userId:'U-001', userName:'Ahmed Hassan', zone:'Satellite Town, Rawalpindi',  wasteTypes:['Household'],  date:'2026-04-27', timeSlot:'08:00 - 10:00', recurrence:'Weekly',   status:'Pending',   workerId:null,    notes:'Today pickup',                        rating:null },
        { id:'B-015', userId:'U-004', userName:'Fatima Malik', zone:'Chaklala, Rawalpindi',        wasteTypes:['Recyclable'], date:'2026-04-27', timeSlot:'12:00 - 14:00', recurrence:'Weekly',   status:'Completed', workerId:'W-005', notes:'Today pickup',                        rating:null },
      ];

      for (const b of SEED_BOOKINGS) {
        await conn.execute(
          `INSERT INTO bookings
             (id, userId, userName, zone, wasteTypes, date, timeSlot, recurrence, status, workerId, notes, rating)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id,
            b.userId,
            b.userName,
            b.zone,
            JSON.stringify(b.wasteTypes),   // store as JSON string in the JSON column
            b.date,
            b.timeSlot,
            b.recurrence,
            b.status,
            b.workerId || null,
            b.notes || '',
            b.rating || null,
          ]
        );
      }
      console.log('    ✅ Seeded: 15 bookings');
    }

  } finally {
    conn.release();
  }
}

// ── Next ID Generators ────────────────────────────────────────
// Called by controllers when creating new records so IDs stay
// in the same "X-NNN" format as the seed data.

async function nextUserId() {
  const [rows] = await pool.execute(
    `SELECT id FROM users ORDER BY CAST(SUBSTRING(id, 3) AS UNSIGNED) DESC LIMIT 1`
  );
  if (!rows.length) return 'U-001';
  const num = parseInt(rows[0].id.replace('U-', ''), 10);
  return 'U-' + String(num + 1).padStart(3, '0');
}

async function nextWorkerId() {
  const [rows] = await pool.execute(
    `SELECT id FROM workers ORDER BY CAST(SUBSTRING(id, 3) AS UNSIGNED) DESC LIMIT 1`
  );
  if (!rows.length) return 'W-001';
  const num = parseInt(rows[0].id.replace('W-', ''), 10);
  return 'W-' + String(num + 1).padStart(3, '0');
}

async function nextBookingId() {
  const [rows] = await pool.execute(
    `SELECT id FROM bookings ORDER BY CAST(SUBSTRING(id, 3) AS UNSIGNED) DESC LIMIT 1`
  );
  if (!rows.length) return 'B-001';
  const num = parseInt(rows[0].id.replace('B-', ''), 10);
  return 'B-' + String(num + 1).padStart(3, '0');
}

// ── Exports ───────────────────────────────────────────────────
module.exports = {
  pool,
  testConnection,
  createTables,
  seedData,
  nextUserId,
  nextWorkerId,
  nextBookingId,
};