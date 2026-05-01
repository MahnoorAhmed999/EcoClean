/**
 * TrashDash — Full Test Suite
 * Covers: Unit, Integration, System, Boundary Value Analysis
 *
 * Run: npm test
 */

const request = require('supertest');
const app     = require('../app');
const db      = require('../src/config/database');
const bcrypt  = require('bcryptjs');
const fs      = require('fs');
const path    = require('path');

// ============================================================
//  TEST HELPERS
// ============================================================

let adminToken, residentToken, residentId;

/**
 * Get a fresh JWT for admin and a test resident.
 * Runs once before all tests.
 */
beforeAll(async () => {
  // Admin login
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@waste.pk', password: 'admin123', role: 'admin' });
  adminToken = adminRes.body.token;

  // Resident login (ahmed@example.com, demo password = 'password')
  const resRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ahmed@example.com', password: 'password', role: 'resident' });
  residentToken = resRes.body.token;
  residentId    = resRes.body.user?.id;
});

// ============================================================
//  TC-001 — Health Check
// ============================================================
describe('TC-001: Health Check', () => {
  test('GET /api/health returns 200 and service name', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('TrashDash API');
  });
});

// ============================================================
//  TC-002 — Admin Login (Valid Credentials)
// ============================================================
describe('TC-002: Admin Login — Valid Credentials', () => {
  test('Returns 200 with token and admin role', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@waste.pk', password: 'admin123', role: 'admin' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.passwordHash).toBeUndefined(); // Never expose hash
  });
});

// ============================================================
//  TC-003 — Admin Login (Wrong Password)
// ============================================================
describe('TC-003: Admin Login — Wrong Password', () => {
  test('Returns 401 with error message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@waste.pk', password: 'wrongpass', role: 'admin' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/password/i);
  });
});

// ============================================================
//  TC-004 — Resident Registration
// ============================================================
describe('TC-004: Resident Registration', () => {
  const uniqueEmail = `testuser_${Date.now()}@example.com`;

  test('Creates new account and returns JWT', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name:    'Test User',
        email:   uniqueEmail,
        password: 'securePass1',
        phone:   '+92-300-0000001',
        address: 'Satellite Town, Rawalpindi',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(uniqueEmail);
    expect(res.body.user.role).toBe('resident');
  });

  test('Duplicate email returns 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name:    'Duplicate User',
        email:   uniqueEmail,
        password: 'securePass1',
      });
    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

// ============================================================
//  TC-005 — Create Booking (Resident)
// ============================================================
describe('TC-005: Create Booking — Resident', () => {
  let createdBookingId;

  test('Valid booking returns 201 with booking object', async () => {
    // Use a future date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const dateStr = futureDate.toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({
        wasteType:  'Recyclable',
        date:       dateStr,
        timeSlot:   '10:00 - 12:00',
        recurrence: 'One-time',
        notes:      'Test booking from automated test',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('Pending');
    expect(res.body.booking.userId).toBe(residentId);
    createdBookingId = res.body.booking.id;
  });

  test('Booking without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ wasteType: 'Household', date: '2027-01-01', timeSlot: '08:00 - 10:00', recurrence: 'One-time' });
    expect(res.statusCode).toBe(401);
  });

  // Cleanup
  afterAll(async () => {
    if (createdBookingId) {
      await request(app)
        .delete(`/api/bookings/${createdBookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });
});

// ============================================================
//  TC-006 — Get Bookings (Authorization Check)
// ============================================================
describe('TC-006: Get Bookings — Authorization', () => {
  test('Resident only receives their own bookings', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${residentToken}`);

    expect(res.statusCode).toBe(200);
    // Every booking must belong to this resident
    res.body.bookings.forEach(b => {
      expect(b.userId).toBe(residentId);
    });
  });

  test('Admin receives all bookings', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    // Admin should see multiple users' bookings
    const userIds = [...new Set(res.body.bookings.map(b => b.userId))];
    expect(userIds.length).toBeGreaterThan(1);
  });
});

// ============================================================
//  TC-007 — Assign Worker to Booking (Admin)
// ============================================================
describe('TC-007: Assign Worker — Admin', () => {
  test('Admin can assign an active worker to a pending booking', async () => {
    // Get a pending booking
    const bookingsRes = await request(app)
      .get('/api/bookings?status=Pending')
      .set('Authorization', `Bearer ${adminToken}`);

    const pendingBooking = bookingsRes.body.bookings[0];
    expect(pendingBooking).toBeDefined();

    // Get an active worker in the same zone
    const workersRes = await request(app)
      .get('/api/workers?status=Active')
      .set('Authorization', `Bearer ${adminToken}`);

    const worker = workersRes.body.workers[0];
    expect(worker).toBeDefined();

    const res = await request(app)
      .post(`/api/bookings/${pendingBooking.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ workerId: worker.id });

    expect(res.statusCode).toBe(200);
    expect(res.body.booking.status).toBe('Assigned');
    expect(res.body.booking.workerId).toBe(worker.id);
  });

  test('Resident cannot assign workers (403)', async () => {
    const res = await request(app)
      .post('/api/bookings/B-001/assign')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ workerId: 'W-001' });
    expect(res.statusCode).toBe(403);
  });
});

// ============================================================
//  TC-008 — User Registry (Admin CRUD)
// ============================================================
describe('TC-008: User Registry — Admin CRUD', () => {
  let newUserId;

  test('Admin can create a user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:    'Test Resident',
        email:   `admin_created_${Date.now()}@test.pk`,
        phone:   '+92-300-1111111',
        address: 'Chaklala, Rawalpindi',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.user.role).toBe('resident');
    newUserId = res.body.user.id;
  });

  test('Admin can list all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
  });

  test('Resident cannot access user list (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.statusCode).toBe(403);
  });

  // Cleanup
  afterAll(async () => {
    if (newUserId) {
      await request(app)
        .delete(`/api/users/${newUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });
});

// ============================================================
//  TC-009 — Worker Management (Admin)
// ============================================================
describe('TC-009: Worker Management', () => {
  let newWorkerId;

  test('Admin can add a worker', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Worker', zone: 'Chaklala', phone: '+92-300-9999999' });

    expect(res.statusCode).toBe(201);
    expect(res.body.worker.status).toBe('Active');
    newWorkerId = res.body.worker.id;
  });

  test('Admin can update worker status to Inactive', async () => {
    const res = await request(app)
      .put(`/api/workers/${newWorkerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Inactive' });

    expect(res.statusCode).toBe(200);
    expect(res.body.worker.status).toBe('Inactive');
  });

  test('Admin can delete worker without active assignments', async () => {
    const res = await request(app)
      .delete(`/api/workers/${newWorkerId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
  });
});

// ============================================================
//  TC-010 — Booking Stats (Admin Dashboard)
// ============================================================
describe('TC-010: Booking Statistics', () => {
  test('GET /api/bookings/stats returns summary data', async () => {
    const res = await request(app)
      .get('/api/bookings/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.totalBookings).toBe('number');
    expect(typeof res.body.stats.pending).toBe('number');
    expect(typeof res.body.stats.completionRate).toBe('number');
    expect(res.body.stats.completionRate).toBeGreaterThanOrEqual(0);
    expect(res.body.stats.completionRate).toBeLessThanOrEqual(100);
  });

  test('Resident cannot access stats (403)', async () => {
    const res = await request(app)
      .get('/api/bookings/stats')
      .set('Authorization', `Bearer ${residentToken}`);
    expect(res.statusCode).toBe(403);
  });
});

// ============================================================
//  BOUNDARY VALUE ANALYSIS (BVA)
// ============================================================

// ---- BVA-1: Password length (min=6) -----------------------
describe('BVA-1: Password Length (min = 6 chars)', () => {
  const basePayload = () => ({
    name:  'BVA User',
    email: `bva_pw_${Date.now()}@test.pk`,
  });

  test('5 chars (below min) → 422', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...basePayload(), password: 'Ab1!x' }); // 5 chars
    expect(res.statusCode).toBe(422);
  });

  test('6 chars (at min) → 201', async () => {
    const payload = { ...basePayload(), password: 'Ab1!xy' }; // 6 chars
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.statusCode).toBe(201);
    // Cleanup
    if (res.body.user?.id) {
      await request(app).delete(`/api/users/${res.body.user.id}`).set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('7 chars (above min) → 201', async () => {
    const payload = { ...basePayload(), password: 'Ab1!xyz' }; // 7 chars
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.statusCode).toBe(201);
    if (res.body.user?.id) {
      await request(app).delete(`/api/users/${res.body.user.id}`).set('Authorization', `Bearer ${adminToken}`);
    }
  });
});

// ---- BVA-2: Booking date (must not be in the past) --------
describe('BVA-2: Booking Date Boundary', () => {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);

  const toISO = d => d.toISOString().split('T')[0];

  const bookingPayload = (date) => ({
    wasteType:  'Household',
    date,
    timeSlot:   '08:00 - 10:00',
    recurrence: 'One-time',
  });

  test('Yesterday (below min) → 422', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${residentToken}`)
      .send(bookingPayload(toISO(yesterday)));
    expect(res.statusCode).toBe(422);
  });

  test('Tomorrow (above min boundary) → 201', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${residentToken}`)
      .send(bookingPayload(toISO(tomorrow)));
    expect(res.statusCode).toBe(201);
    // Cleanup
    if (res.body.booking?.id) {
      await request(app).delete(`/api/bookings/${res.body.booking.id}`).set('Authorization', `Bearer ${adminToken}`);
    }
  });
});

// ---- BVA-3: Booking notes length (max=500) ----------------
describe('BVA-3: Booking Notes Length (max = 500 chars)', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const dateStr = futureDate.toISOString().split('T')[0];

  test('500 chars (at max) → 201', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({
        wasteType:  'Organic',
        date:       dateStr,
        timeSlot:   '12:00 - 14:00',
        recurrence: 'One-time',
        notes:      'A'.repeat(500),
      });
    expect(res.statusCode).toBe(201);
    if (res.body.booking?.id) {
      await request(app).delete(`/api/bookings/${res.body.booking.id}`).set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('501 chars (above max) → 422', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({
        wasteType:  'Organic',
        date:       dateStr,
        timeSlot:   '12:00 - 14:00',
        recurrence: 'One-time',
        notes:      'A'.repeat(501),
      });
    expect(res.statusCode).toBe(422);
  });
});

// ---- BVA-4: Username length (min=2, max=80) ---------------
describe('BVA-4: User Name Length (min=2, max=80)', () => {
  const uniqueEmail = () => `bva_name_${Date.now()}@test.pk`;

  test('1 char name (below min) → 422', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: uniqueEmail(), password: 'pass123' });
    expect(res.statusCode).toBe(422);
  });

  test('2 char name (at min) → 201', async () => {
    const payload = { name: 'AB', email: uniqueEmail(), password: 'pass123' };
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.statusCode).toBe(201);
    if (res.body.user?.id) {
      await request(app).delete(`/api/users/${res.body.user.id}`).set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('80 char name (at max) → 201', async () => {
    const payload = { name: 'A'.repeat(80), email: uniqueEmail(), password: 'pass123' };
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.statusCode).toBe(201);
    if (res.body.user?.id) {
      await request(app).delete(`/api/users/${res.body.user.id}`).set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('81 char name (above max) → 422', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A'.repeat(81), email: uniqueEmail(), password: 'pass123' });
    expect(res.statusCode).toBe(422);
  });
});
