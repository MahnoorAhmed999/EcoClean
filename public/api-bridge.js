/**
 * EcoClean / TrashDash — API Bridge
 * ──────────────────────────────────────────────────────────────
 * Talks to the Express backend hosted on Railway.
 *
 * HOW THE URL IS BUILT:
 *   API_BASE_URL  =  https://ecoclean-production-62c7.up.railway.app
 *   every path    =  /api/auth/login  |  /api/bookings  |  etc.
 *   final URL     =  API_BASE_URL + path
 *
 * app.js mounts routes as:
 *   app.use('/api/auth',     authRoutes)
 *   app.use('/api/bookings', bookingRoutes)
 *   app.use('/api/users',    userRoutes)
 *   app.use('/api/workers',  workerRoutes)
 *
 * So paths here must start with /api/... — NOT /auth/... directly.
 *
 * Include in every HTML page:
 *   <script src="api-bridge.js"></script>
 */

// ── Base URL ──────────────────────────────────────────────────
// Points to your live Railway deployment.
// NO trailing slash. NO /api suffix here — every path below
// already starts with /api/... so it is appended there.
const API_BASE_URL = 'https://ecoclean-production-62c7.up.railway.app';

// ── Token helpers ─────────────────────────────────────────────
function getToken() {
  return sessionStorage.getItem('td_token') || '';
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ── Core HTTP wrapper ─────────────────────────────────────────
// Every API call goes through here.
// path must start with /api/  e.g. '/api/auth/login'
async function apiFetch(path, opts = {}) {
  const url = API_BASE_URL + path;

  let res;
  try {
    res = await fetch(url, {
      headers: authHeaders(),
      ...opts,
    });
  } catch (networkErr) {
    // fetch() itself threw — server unreachable, no internet, CORS preflight blocked, etc.
    console.error('[apiFetch] Network error on', url, networkErr);
    throw new Error('Cannot reach the server. Check your internet connection or try again later.');
  }

  // Parse JSON — even error responses from Express come back as JSON
  let json;
  try {
    json = await res.json();
  } catch {
    // Server returned non-JSON (e.g. an HTML error page from Railway on 502)
    throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    // Use the message the backend sent, fall back to status code
    const msg = json?.message || json?.errors?.[0]?.msg || `Request failed (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return json;
}

// ── In-memory cache ───────────────────────────────────────────
// Keeps the sync getter functions (getBookings / getUsers / getWorkers)
// working without changing admin-app.js or resident-app.js.
// Populated by refreshStore() after every mutation.
window._tdCache = { bookings: [], users: [], workers: [] };

async function refreshStore() {
  try {
    // Only fetch what the current role needs
    const token = getToken();
    if (!token) return; // not logged in — nothing to fetch

    const auth = JSON.parse(sessionStorage.getItem('td_auth') || '{}');
    const isAdmin = auth.role === 'admin';

    if (isAdmin) {
      // Admin needs all three
      const [b, u, w] = await Promise.all([
        apiFetch('/api/bookings'),
        apiFetch('/api/users'),
        apiFetch('/api/workers'),
      ]);
      window._tdCache.bookings = b.bookings || [];
      window._tdCache.users    = u.users    || [];
      window._tdCache.workers  = w.workers  || [];
    } else {
      // Resident only needs their own bookings + workers (for the workers tab)
      const [b, w] = await Promise.all([
        apiFetch('/api/bookings'),
        apiFetch('/api/workers'),
      ]);
      window._tdCache.bookings = b.bookings || [];
      window._tdCache.workers  = w.workers  || [];
      // users cache stays empty for residents — they use /api/auth/me for own profile
    }
  } catch (e) {
    console.warn('[TrashDash] refreshStore failed:', e.message);
  }
}

// Sync getters — same names as old admin-data.js so no other file changes
function getBookings() { return window._tdCache.bookings; }
function getUsers()    { return window._tdCache.users;    }
function getWorkers()  { return window._tdCache.workers;  }

// These are no-ops now — data lives in the cloud, not local memory.
// Kept so any leftover calls in admin-app.js / resident-app.js don't throw.
async function saveBookings(d) { window._tdCache.bookings = d; }
async function saveUsers(d)    { window._tdCache.users    = d; }
async function saveWorkers(d)  { window._tdCache.workers  = d; }

// ── AUTH ──────────────────────────────────────────────────────

/**
 * apiLogin(email, password, role)
 * role = 'resident' | 'admin'
 *
 * Calls:  POST /api/auth/login
 * Returns the full server response so login.html can read res.success / res.message
 */
async function apiLogin(email, password, role) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });

  // Persist JWT + basic user info for the session
  sessionStorage.setItem('td_token', res.token);
  sessionStorage.setItem('td_auth', JSON.stringify({
    role:   res.user.role,
    userId: res.user.id,
    email:  res.user.email,
    name:   res.user.name,
  }));

  return res; // { success, token, user: { id, name, email, role } }
}

/**
 * apiRegister(name, email, password, phone, address)
 *
 * Calls:  POST /api/auth/register
 * Logs the user in immediately on success (saves token).
 */
async function apiRegister(name, email, password, phone, address) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, phone, address }),
  });

  sessionStorage.setItem('td_token', res.token);
  sessionStorage.setItem('td_auth', JSON.stringify({
    role:   'resident',
    userId: res.user.id,
    email:  res.user.email,
    name:   res.user.name,
  }));

  return res; // { success, token, user: { id, name, email, role } }
}

/**
 * apiLogout()
 * Clears session and redirects to login page.
 */
function apiLogout() {
  sessionStorage.removeItem('td_token');
  sessionStorage.removeItem('td_auth');
  window.location.href = 'login.html';
}

/**
 * apiGetMe()
 * Fetches the logged-in user's own profile from the server.
 * Use this on dashboard load instead of reading from sessionStorage.
 *
 * Calls:  GET /api/auth/me
 */
async function apiGetMe() {
  const res = await apiFetch('/api/auth/me');
  return res.user; // full user object including phone, address, totalBookings, etc.
}

// ── BOOKINGS ──────────────────────────────────────────────────

/**
 * apiCreateBooking(wasteTypes, date, timeSlot, recurrence, notes)
 *
 * wasteTypes — array of strings e.g. ['Household', 'Recyclable']
 *              also accepts a single string for backward compatibility.
 *
 * Calls:  POST /api/bookings
 */
async function apiCreateBooking(wasteTypes, date, timeSlot, recurrence, notes) {
  // Normalise: wrap a plain string in an array for backward compat
  if (typeof wasteTypes === 'string') wasteTypes = [wasteTypes];

  const res = await apiFetch('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({ wasteTypes, date, timeSlot, recurrence, notes }),
  });
  await refreshStore();
  return res.booking;
}

/**
 * apiUpdateBookingStatus(bookingId, status, workerId?, rating?)
 *
 * Calls:  PATCH /api/bookings/:id/status
 */
async function apiUpdateBookingStatus(bookingId, status, workerId, rating) {
  const body = { status };
  if (workerId !== undefined) body.workerId = workerId;
  if (rating   !== undefined) body.rating   = rating;

  const res = await apiFetch(`/api/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  await refreshStore();
  return res.booking;
}

/**
 * apiAssignWorker(bookingId, workerId)
 *
 * Calls:  POST /api/bookings/:id/assign
 */
async function apiAssignWorker(bookingId, workerId) {
  const res = await apiFetch(`/api/bookings/${bookingId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ workerId }),
  });
  await refreshStore();
  return res.booking;
}

/**
 * apiDeleteBooking(bookingId)
 *
 * Calls:  DELETE /api/bookings/:id
 */
async function apiDeleteBooking(bookingId) {
  await apiFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
  await refreshStore();
}

/**
 * apiGetStats()
 * Returns aggregate numbers for admin overview cards.
 *
 * Calls:  GET /api/bookings/stats
 */
async function apiGetStats() {
  const res = await apiFetch('/api/bookings/stats');
  return res.stats;
}

// ── USERS ─────────────────────────────────────────────────────

/**
 * apiCreateUser(name, email, phone, address, password?)
 * Admin creates a resident manually.
 *
 * Calls:  POST /api/users
 */
async function apiCreateUser(name, email, phone, address, password = 'password123') {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, phone, address, password }),
  });
  await refreshStore();
  return res.user;
}

/**
 * apiUpdateUser(userId, changes)
 *
 * Calls:  PUT /api/users/:id
 */
async function apiUpdateUser(userId, changes) {
  const res = await apiFetch(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
  await refreshStore();
  return res.user;
}

/**
 * apiDeleteUser(userId)
 *
 * Calls:  DELETE /api/users/:id
 */
async function apiDeleteUser(userId) {
  await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
  await refreshStore();
}

// ── WORKERS ───────────────────────────────────────────────────

/**
 * apiCreateWorker(name, zone, phone)
 *
 * Calls:  POST /api/workers
 */
async function apiCreateWorker(name, zone, phone) {
  const res = await apiFetch('/api/workers', {
    method: 'POST',
    body: JSON.stringify({ name, zone, phone }),
  });
  await refreshStore();
  return res.worker;
}

/**
 * apiUpdateWorker(workerId, changes)
 *
 * Calls:  PUT /api/workers/:id
 */
async function apiUpdateWorker(workerId, changes) {
  const res = await apiFetch(`/api/workers/${workerId}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
  await refreshStore();
  return res.worker;
}

/**
 * apiDeleteWorker(workerId)
 *
 * Calls:  DELETE /api/workers/:id
 */
async function apiDeleteWorker(workerId) {
  await apiFetch(`/api/workers/${workerId}`, { method: 'DELETE' });
  await refreshStore();
}

// ── Zone normaliser (used by admin-app.js) ────────────────────
// Strips ", Rawalpindi" so booking zones match worker zones.
// Defined here so admin-data.js can be removed entirely.
function normaliseZone(zone) {
  if (!zone) return '';
  return zone.replace(/,?\s*rawalpindi/i, '').trim();
}

// ── Priority helper ───────────────────────────────────────────
const PRIORITY_THRESHOLD = 10;
function isPriorityUser(user) {
  return (user?.totalBookings || 0) >= PRIORITY_THRESHOLD;
}

// ── Bootstrap ─────────────────────────────────────────────────
// On every page load: if a token exists in sessionStorage, pre-load
// the cache so admin-app.js / resident-app.js have data immediately.
(async () => {
  if (getToken()) {
    await refreshStore();
    // Signal to any page script that data is ready
    window.isDataReady = true;
    window.dispatchEvent(new Event('tdDataReady'));
  }
})();