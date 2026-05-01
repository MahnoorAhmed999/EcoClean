/**
 * TrashDash — Aiven DB Migration Script
 * ══════════════════════════════════════════════════════════════
 * Run this ONCE to restore your Aiven MySQL database from your
 * local JSON files (users.json, workers.json, bookings.json).
 *
 * HOW TO RUN:
 *   1. Put this file in your trash_dash/ root folder
 *   2. Make sure your .env file has DB_HOST, DB_PORT, DB_USER,
 *      DB_PASSWORD, DB_NAME filled in
 *   3. Run:  node migrate-to-aiven.js
 *
 * WHAT IT DOES:
 *   - Drops and recreates all 4 tables (clean slate)
 *   - Inserts all users from users.json (skips the admin row)
 *   - Inserts the admin into the admins table
 *   - Inserts all workers from workers.json
 *   - Inserts all bookings from bookings.json
 *      (converts wasteType string → wasteTypes array automatically)
 * ══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const path  = require('path');
const fs    = require('fs');

// ── Load JSON files ──────────────────────────────────────────
// These files should be in the same folder as this script.
// Adjust paths if your folder structure is different.
function loadJson(filename) {
  const p = path.join(__dirname, filename);
  if (!fs.existsSync(p)) {
    console.error(`❌  File not found: ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── DB Connection ────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    5,
  ssl: { rejectUnauthorized: false },
  typeCast: function (field, next) {
    if (field.type === 'JSON') {
      const val = field.string();
      try { return JSON.parse(val); } catch { return val; }
    }
    return next();
  },
});

// ── Main Migration ───────────────────────────────────────────
async function migrate() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   TrashDash — Aiven DB Migration             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log(`🔌  Connecting to: ${process.env.DB_HOST}:${process.env.DB_PORT}`);

  let conn;
  try {
    conn = await pool.getConnection();
    console.log('✅  Connected!\n');
  } catch (e) {
    console.error('❌  Connection failed:', e.message);
    console.error('    → Check your .env file has correct DB_HOST / DB_USER / DB_PASSWORD / DB_NAME');
    process.exit(1);
  }

  try {
    // ── Step 1: Drop existing tables (clean slate) ───────────
    console.log('🗑️   Dropping old tables...');
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
    await conn.execute('DROP TABLE IF EXISTS bookings');
    await conn.execute('DROP TABLE IF EXISTS users');
    await conn.execute('DROP TABLE IF EXISTS workers');
    await conn.execute('DROP TABLE IF EXISTS admins');
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('    Done.\n');

    // ── Step 2: Create tables ────────────────────────────────
    console.log('🏗️   Creating tables...');

    await conn.execute(`
      CREATE TABLE admins (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(255)        NOT NULL DEFAULT 'Admin',
        email     VARCHAR(255) UNIQUE NOT NULL,
        password  VARCHAR(255)        NOT NULL,
        createdAt TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE users (
        id            VARCHAR(20)  PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password      VARCHAR(255) NOT NULL,
        phone         VARCHAR(50),
        address       VARCHAR(500),
        totalBookings INT          NOT NULL DEFAULT 0,
        rating        DECIMAL(3,1) NOT NULL DEFAULT 0.0,
        memberSince   VARCHAR(20),
        status        ENUM('Active','Inactive') DEFAULT 'Active',
        createdAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE workers (
        id               VARCHAR(20)  PRIMARY KEY,
        name             VARCHAR(255) NOT NULL,
        zone             VARCHAR(255),
        phone            VARCHAR(50),
        status           ENUM('Active','Inactive') DEFAULT 'Active',
        assignedBookings INT          NOT NULL DEFAULT 0,
        createdAt        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE bookings (
        id          VARCHAR(20)  PRIMARY KEY,
        userId      VARCHAR(20)  NOT NULL,
        userName    VARCHAR(255),
        zone        VARCHAR(500),
        wasteTypes  JSON         NOT NULL,
        date        DATE         NOT NULL,
        timeSlot    VARCHAR(50),
        recurrence  VARCHAR(50)  DEFAULT 'One-time',
        status      ENUM('Pending','Assigned','Completed','Cancelled') DEFAULT 'Pending',
        workerId    VARCHAR(20)  DEFAULT NULL,
        notes       TEXT,
        rating      TINYINT      DEFAULT NULL,
        createdAt   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_booking_user
          FOREIGN KEY (userId)   REFERENCES users(id)   ON DELETE CASCADE,
        CONSTRAINT fk_booking_worker
          FOREIGN KEY (workerId) REFERENCES workers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('    ✅ admins, users, workers, bookings created.\n');

    // ── Step 3: Insert admin ─────────────────────────────────
    console.log('👑  Inserting admin...');
    await conn.execute(
      `INSERT INTO admins (name, email, password) VALUES (?, ?, ?)`,
      ['TrashDash Admin', 'admin@waste.pk', 'admin123']
    );
    console.log('    ✅ admin@waste.pk / admin123\n');

    // ── Step 4: Insert workers ───────────────────────────────
    console.log('👷  Inserting workers from workers.json...');
    const workers = loadJson('workers.json');
    let wCount = 0;
    for (const w of workers) {
      await conn.execute(
        `INSERT INTO workers (id, name, zone, phone, status, assignedBookings)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [w.id, w.name, w.zone, w.phone || '', w.status || 'Active', w.assignedBookings || 0]
      );
      wCount++;
    }
    console.log(`    ✅ ${wCount} workers inserted.\n`);

    // ── Step 5: Insert users ─────────────────────────────────
    console.log('👤  Inserting users from users.json...');
    const allUsers = loadJson('users.json');

    // Separate real residents from the admin entry
    // users.json has an entry with role:"admin" and id:"A-001" — skip it
    const residents = allUsers.filter(u => u.role !== 'admin' && !u.id.startsWith('A-'));

    let uCount = 0;
    for (const u of residents) {
      // passwordHash in users.json might be a bcrypt hash OR plain text
      // We store it as-is — the auth controller handles both
      const pw = u.passwordHash || u.password || 'password123';
      const rating = parseFloat(u.rating) || 0.0;
      const totalBookings = parseInt(u.totalBookings) || 0;

      await conn.execute(
        `INSERT INTO users
           (id, name, email, password, phone, address, totalBookings, rating, memberSince, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.id,
          u.name,
          u.email,
          pw,
          u.phone || '',
          u.address || '',
          totalBookings,
          rating,
          u.memberSince || 'Jan 2025',
          u.status || 'Active',
        ]
      );
      uCount++;
      console.log(`    → ${u.id}  ${u.email}  (pw: ${pw.startsWith('$2') ? '[bcrypt hash]' : pw})`);
    }
    console.log(`    ✅ ${uCount} users inserted.\n`);

    // ── Step 6: Insert bookings ──────────────────────────────
    console.log('📋  Inserting bookings from bookings.json...');
    const bookings = loadJson('bookings.json');

    // Build a set of valid userIds so we can skip orphaned bookings
    const validUserIds = new Set(residents.map(u => u.id));
    // Build a set of valid workerIds
    const validWorkerIds = new Set(workers.map(w => w.id));

    let bCount = 0;
    let bSkipped = 0;
    for (const b of bookings) {
      // Skip if userId doesn't exist (foreign key would fail)
      if (!validUserIds.has(b.userId)) {
        console.log(`    ⚠️  Skipped ${b.id} — userId ${b.userId} not found`);
        bSkipped++;
        continue;
      }

      // Convert wasteType (string) → wasteTypes (array) if needed
      let wasteTypes;
      if (Array.isArray(b.wasteTypes)) {
        wasteTypes = b.wasteTypes;
      } else if (b.wasteType) {
        wasteTypes = [b.wasteType];
      } else {
        wasteTypes = ['Household'];
      }

      // Validate workerId — set to null if worker doesn't exist
      const workerId = b.workerId && validWorkerIds.has(b.workerId) ? b.workerId : null;

      await conn.execute(
        `INSERT INTO bookings
           (id, userId, userName, zone, wasteTypes, date, timeSlot, recurrence, status, workerId, notes, rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.id,
          b.userId,
          b.userName || '',
          b.zone || '',
          JSON.stringify(wasteTypes),
          b.date,
          b.timeSlot || '',
          b.recurrence || 'One-time',
          b.status || 'Pending',
          workerId,
          b.notes || '',
          b.rating || null,
        ]
      );
      bCount++;
    }
    console.log(`    ✅ ${bCount} bookings inserted. ${bSkipped > 0 ? `(${bSkipped} skipped)` : ''}\n`);

    // ── Step 7: Final verification ───────────────────────────
    console.log('🔍  Verification:');
    const [[{ adminCnt }]]   = await conn.execute('SELECT COUNT(*) AS adminCnt FROM admins');
    const [[{ userCnt }]]    = await conn.execute('SELECT COUNT(*) AS userCnt FROM users');
    const [[{ workerCnt }]]  = await conn.execute('SELECT COUNT(*) AS workerCnt FROM workers');
    const [[{ bookingCnt }]] = await conn.execute('SELECT COUNT(*) AS bookingCnt FROM bookings');

    console.log(`    admins:   ${adminCnt}`);
    console.log(`    users:    ${userCnt}`);
    console.log(`    workers:  ${workerCnt}`);
    console.log(`    bookings: ${bookingCnt}`);

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   ✅  Migration complete!                     ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('\nYou can now start your server:  node server.js');
    console.log('Login with:  admin@waste.pk / admin123\n');

  } catch (e) {
    console.error('\n❌  Migration failed:', e.message);
    console.error(e);
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate();
