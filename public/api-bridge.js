/**
 * EcoClean — API Bridge (Cloud Edition)
 * ─────────────────────────────────────────────────
 * Connects your HTML frontend to the Express + Aiven MySQL backend.
 * Passwords sent to the server EXACTLY as typed — no browser-side changes.
 *
 * Include this in ALL your HTML pages:
 *   <script src="api-bridge.js"></script>
 */

//const API_BASE = 'http://localhost:3000/api';

const API_BASE_URL = 'ecoclean-production-62c7.up.railway.app'

// This tells the app: "If I'm on Vercel, talk to Vercel. If I'm on my laptop, talk to my laptop."
/*const API_BASE_URL = (window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.hostname.startsWith('192.168.'))
  ? `http://${window.location.hostname}:5000` 
  : 'https://ecoclean-rosy.vercel.app';
*/
console.log("Current Hostname:", window.location.hostname);
console.log("Target API URL:", API_BASE_URL);

// ── Token helpers ────────────────────────────────────────────
function getToken() {
  return sessionStorage.getItem('td_token') || '';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

// ── Core HTTP wrapper ────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  // Update API_BASE to API_BASE_URL below
  const res  = await fetch(API_BASE_URL + path, { 
    headers: authHeaders(), 
    ...opts 
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json.message || json.errors?.[0]?.msg || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// ── In-memory cache (keeps sync functions working) ───────────
window._tdCache = { bookings: [], users: [], workers: [] };

async function refreshStore() {
  try {
    const auth = JSON.parse(sessionStorage.getItem('td_auth') || '{}');
    const isAdmin = auth.role === 'admin';

    if (isAdmin) {
      // Admin: fetch everything in parallel
      const [b, u, w] = await Promise.all([
        apiFetch('/bookings'),
        apiFetch('/users'),
        apiFetch('/workers'),
      ]);
      window._tdCache.bookings = b.bookings || [];
      window._tdCache.users = (u.users || []).map(user => ({
        ...user,
        totalBookings: user.totalBookings || 0,
        rating: user.rating || 5.0,
        memberSince: user.memberSince || '2024',
        status: user.status || 'Active',
      }));
      window._tdCache.workers = w.workers || [];

    } else {
      // Resident: only fetch own bookings + workers
      // /api/users requires admin — residents get 403 which breaks everything
      const [b, w] = await Promise.all([
        apiFetch('/bookings'),
        apiFetch('/workers'),
      ]);
      window._tdCache.bookings = b.bookings || [];
      window._tdCache.workers  = w.workers  || [];

      // Fetch just this resident's own profile and put it in the users cache
      // so getUsers().find(u => u.id === auth.userId) works in resident-app.js
      if (auth.userId) {
        try {
          const profileRes = await apiFetch('/users/' + auth.userId);
          if (profileRes.user) {
            const idx = window._tdCache.users.findIndex(x => x.id === auth.userId);
            if (idx >= 0) {
              window._tdCache.users[idx] = profileRes.user;
            } else {
              window._tdCache.users = [profileRes.user];
            }
          }
        } catch (profileErr) {
          console.warn('[EcoClean] Could not load profile:', profileErr.message);
        }
      }
    }
  } catch (e) {
    console.warn('[EcoClean] refreshStore:', e.message);
  }
}

// Sync getters (same names as old admin-data.js)
function getBookings() { return window._tdCache.bookings; }
function getUsers()    { return window._tdCache.users; }
function getWorkers()  { return window._tdCache.workers; }
async function saveBookings(d) { window._tdCache.bookings = d; }
async function saveUsers(d)    { window._tdCache.users = d; }
async function saveWorkers(d)  { window._tdCache.workers = d; }

// ── AUTH ─────────────────────────────────────────────────────

/**
 * Login — password sent to server exactly as typed.
 */
async function apiLogin(email, password, role) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
  sessionStorage.setItem('td_token', res.token);
  sessionStorage.setItem('td_auth', JSON.stringify({
    role:   res.user.role,
    userId: res.user.id,
    email:  res.user.email,
    name:   res.user.name,
  }));
  return res;
}

/**
 * Register — password sent to server exactly as typed.
 */
async function apiRegister(name, email, password, phone, address) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, phone, address }),
  });
  sessionStorage.setItem('td_token', res.token);
  sessionStorage.setItem('td_auth', JSON.stringify({
    role: 'resident', userId: res.user.id, email: res.user.email, name: res.user.name,
  }));
  return res;
}

function apiLogout() {
  sessionStorage.removeItem('td_token');
  sessionStorage.removeItem('td_auth');
  window.location.href = 'login.html';
}

// ── BOOKINGS ─────────────────────────────────────────────────

/**
 * Create a booking.
 * @param {string[]} wasteTypes  Array of selected waste types, e.g. ['Household', 'Recyclable']
 * @param {string}   date        ISO date string, e.g. '2026-05-10'
 * @param {string}   timeSlot    e.g. '09:00 - 11:00'
 * @param {string}   recurrence  'One-time' | 'Weekly' | 'Monthly'
 * @param {string}   notes       Optional special instructions
 */
async function apiCreateBooking(wasteTypes, date, timeSlot, recurrence, notes) {
  // Normalise: always send an array; the server joins them for storage if needed
  const typesArray = Array.isArray(wasteTypes) ? wasteTypes : [wasteTypes];
  const res = await apiFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify({ wasteTypes: typesArray, date, timeSlot, recurrence, notes }),
  });
  await refreshStore();
  return res.booking;
}

async function apiUpdateBookingStatus(bookingId, status, workerId, rating) {
  const body = { status };
  if (workerId !== undefined) body.workerId = workerId;
  if (rating   !== undefined) body.rating   = rating;
  const res = await apiFetch(`/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  await refreshStore();
  return res.booking;
}

async function apiAssignWorker(bookingId, workerId) {
  const res = await apiFetch(`/bookings/${bookingId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ workerId }),
  });
  await refreshStore();
  return res.booking;
}

async function apiDeleteBooking(bookingId) {
  await apiFetch(`/bookings/${bookingId}`, { method: 'DELETE' });
  await refreshStore();
}

async function apiGetStats() {
  const res = await apiFetch('/bookings/stats');
  return res.stats;
}

// ── USERS ─────────────────────────────────────────────────────
async function apiCreateUser(name, email, phone, address, password = 'password123') {
  const res = await apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, phone, address, password }),
  });
  await refreshStore();
  return res.user;
}

async function apiUpdateUser(userId, changes) {
  const res = await apiFetch(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
  await refreshStore();
  return res.user;
}

async function apiDeleteUser(userId) {
  await apiFetch(`/users/${userId}`, { method: 'DELETE' });
  await refreshStore();
}

// ── PROFILE (resident self-service) ──────────────────────────

/**
 * Fetch the current logged-in resident's profile from the server.
 * @param {string} userId
 * @returns {Promise<object>} user profile object
 */
async function apiGetProfile(userId) {
  const res = await apiFetch(`/users/${userId}`);
  return res.user;
}

/**
 * Update the current logged-in resident's profile on the server.
 * @param {string} userId
 * @param {object} changes  e.g. { name, phone, address }
 * @returns {Promise<object>} updated user object
 */
async function apiUpdateProfile(userId, changes) {
  const res = await apiFetch(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
  // Keep session name in sync if name changed
  if (changes.name) {
    const auth = JSON.parse(sessionStorage.getItem('td_auth') || '{}');
    auth.name = changes.name;
    sessionStorage.setItem('td_auth', JSON.stringify(auth));
  }
  return res.user;
}

// ── WORKERS ──────────────────────────────────────────────────
async function apiCreateWorker(name, zone, phone) {
  const res = await apiFetch('/workers', {
    method: 'POST',
    body: JSON.stringify({ name, zone, phone }),
  });
  await refreshStore();
  return res.worker;
}

async function apiUpdateWorker(workerId, changes) {
  const res = await apiFetch(`/workers/${workerId}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
  await refreshStore();
  return res.worker;
}

async function apiDeleteWorker(workerId) {
  await apiFetch(`/workers/${workerId}`, { method: 'DELETE' });
  await refreshStore();
}

// ── Priority helper (backwards compat) ───────────────────────
const PRIORITY_THRESHOLD = 10;
function isPriorityUser(user) { return user.totalBookings >= PRIORITY_THRESHOLD; }

// ── Zone normalisation (shared by admin-app.js and worker.html) ──
/**
 * Strip ", Rawalpindi" suffix so booking zones and worker zones
 * can be compared consistently regardless of how they were stored.
 * e.g. "Satellite Town, Rawalpindi" → "Satellite Town"
 */
function normaliseZone(zone) {
  return (zone || '').replace(', Rawalpindi', '').trim();
}

// ── Bootstrap: load data if already logged in ─────────────────
window.isDataReady = (async () => {
  if (getToken()) {
    console.log('[EcoClean] Syncing with Aiven Database...');
    await refreshStore();
    console.log('[EcoClean] Sync complete. Users found:', window._tdCache.users.length);
  }
  return true;
})();