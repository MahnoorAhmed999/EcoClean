// ============================================================
//  EcoClean — Resident Application Logic
//  Written to match dashboard.html IDs exactly.
//  Depends on: api-bridge.js (must load first)
// ============================================================

// ── Session helper ───────────────────────────────────────────
function getAuthUser() {
  try { return JSON.parse(sessionStorage.getItem('td_auth') || '{}'); }
  catch { return {}; }
}

// ── Booking state ────────────────────────────────────────────
let selectedWasteTypes = [];
let currentHistoryFilter = 'all';

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const auth = getAuthUser();

  if (!auth.userId) {
    window.location.href = 'login.html';
    return;
  }

  const dateEl = document.getElementById('pageDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-PK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await window.isDataReady;
  await refreshStore();

  setSidebarUser(auth);

  renderDashboardTab();
  renderBookingHistory();
  renderWorkersTab();
  await loadAndRenderProfile();

  const bDate = document.getElementById('bDate');
  if (bDate) bDate.min = new Date().toISOString().slice(0, 10);
});

// ── Sidebar user chip ────────────────────────────────────────
function setSidebarUser(auth) {
  const name  = auth.name  || 'Resident';
  const email = auth.email || '';

  const sbAvatar = document.getElementById('sbAvatar');
  const sbName   = document.getElementById('sbName');
  const sbEmail  = document.getElementById('sbEmail');

  if (sbAvatar) sbAvatar.textContent = name.charAt(0).toUpperCase();
  if (sbName)   sbName.textContent   = name;
  if (sbEmail)  sbEmail.textContent  = email;
}

// ── DASHBOARD TAB ────────────────────────────────────────────
function renderDashboardTab() {
  const auth     = getAuthUser();
  const bookings = getBookings().filter(function(b) { return b.userId === auth.userId; });

  // Welcome title
  const hour   = new Date().getHours();
  const greet  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const wTitle = document.getElementById('welcomeTitle');
  if (wTitle) wTitle.textContent = greet + ', ' + (auth.name || 'Resident') + ' 👋';

  // Stat cards
  const completed = bookings.filter(function(b) { return b.status === 'Completed'; }).length;
  const pending   = bookings.filter(function(b) { return b.status === 'Pending'; }).length;
  const total     = bookings.length;

  setText('statTotal',     total);
  setText('statCompleted', completed);
  setText('statPending',   pending);

  // Next upcoming pickup
  const upcoming = bookings
    .filter(function(b) { return b.status === 'Pending' || b.status === 'Assigned'; })
    .sort(function(a, b) { return a.date.localeCompare(b.date); });

  if (upcoming.length) {
    const next = upcoming[0];
    setText('statNextDate', formatDate(next.date));
    const types = Array.isArray(next.wasteTypes) ? next.wasteTypes.join(', ') : (next.wasteType || '—');
    setText('statNextType', types + ' • ' + (next.timeSlot || ''));
  } else {
    setText('statNextDate', '—');
    setText('statNextType', 'No upcoming pickups');
  }

  // Booking stats mini row (dashboard tab)
  renderBookingStatsRow('bookingStatsRow', bookings);

  // Priority banner
  const isPriority = total >= 10;
  const banner = document.getElementById('priorityBanner');
  if (banner) banner.style.display = isPriority ? 'flex' : 'none';

  // Recent activity list
  renderRecentActivity(bookings);

  // Booking journey card
  renderBookingJourney(bookings);
}

function renderBookingStatsRow(containerId, bookings) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const counts = {
    Pending:   bookings.filter(function(b) { return b.status === 'Pending'; }).length,
    Assigned:  bookings.filter(function(b) { return b.status === 'Assigned'; }).length,
    Completed: bookings.filter(function(b) { return b.status === 'Completed'; }).length,
    Cancelled: bookings.filter(function(b) { return b.status === 'Cancelled'; }).length,
  };

  const colors = {
    Pending:   '#F59E0B', Assigned: '#3B82F6',
    Completed: '#10B981', Cancelled: '#EF4444',
  };
  const icons = { Pending: '🟡', Assigned: '🔵', Completed: '🟢', Cancelled: '🔴' };

  el.innerHTML = Object.entries(counts).map(function(entry) {
    const status = entry[0];
    const count  = entry[1];
    return '<div style="background:#fff;border-radius:var(--radius);border:1px solid var(--border);padding:14px 16px;text-align:center">' +
      '<div style="font-size:20px">' + icons[status] + '</div>' +
      '<div style="font-family:\'Fraunces\',serif;font-size:22px;font-weight:800;color:' + colors[status] + '">' + count + '</div>' +
      '<div style="font-size:11px;color:var(--text-500);font-weight:600;margin-top:2px">' + status + '</div>' +
      '</div>';
  }).join('');
}

function renderRecentActivity(bookings) {
  const el = document.getElementById('recentList');
  if (!el) return;

  const recent = bookings.slice().sort(function(a, b) {
    return (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '');
  }).slice(0, 5);

  if (!recent.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-300)">' +
      '<div style="font-size:32px;margin-bottom:8px">🗑️</div>' +
      '<div style="font-size:13px">No bookings yet. Click "Book Pickup" to start!</div>' +
      '</div>';
    return;
  }

  const statusColors = {
    Pending: '#F59E0B', Assigned: '#3B82F6', Completed: '#10B981', Cancelled: '#EF4444'
  };

  el.innerHTML = recent.map(function(b) {
    const types = Array.isArray(b.wasteTypes) ? b.wasteTypes.join(', ') : (b.wasteType || '—');
    const color = statusColors[b.status] || '#888';
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--green-soft)">' +
      '<div style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text-900)">' + types + '</div>' +
        '<div style="font-size:11px;color:var(--text-300)">' + formatDate(b.date) + ' · ' + (b.timeSlot || '') + '</div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:700;color:' + color + ';background:' + color + '18;padding:3px 8px;border-radius:100px;white-space:nowrap">' + b.status + '</span>' +
      '</div>';
  }).join('');
}

// ── Booking Journey (replaces Environmental Impact) ──────────
function renderBookingJourney(bookings) {
  const el = document.getElementById('bookingJourney');
  if (!el) return;

  const workers   = getWorkers();
  const booked    = bookings.length;
  const assigned  = bookings.filter(function(b) { return b.status === 'Assigned' || b.status === 'Completed'; }).length;
  const completed = bookings.filter(function(b) { return b.status === 'Completed'; }).length;

  // Most recent completed booking with a worker
  const completedWithWorker = bookings.filter(function(b) { return b.status === 'Completed' && b.workerId; });
  completedWithWorker.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  const lastDone   = completedWithWorker[0] || null;
  const lastWorker = lastDone ? workers.find(function(w) { return w.id === lastDone.workerId; }) : null;

  // Most recent actively assigned booking
  const activeList = bookings.filter(function(b) { return b.status === 'Assigned' && b.workerId; });
  activeList.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
  const activeAssigned = activeList[0] || null;
  const activeWorker   = activeAssigned ? workers.find(function(w) { return w.id === activeAssigned.workerId; }) : null;

  var workerText;
  if (activeWorker) {
    workerText = '<strong>' + activeWorker.name + '</strong> is assigned to your next pickup on <strong>' + formatDate(activeAssigned.date) + '</strong>.';
  } else if (assigned) {
    workerText = assigned + ' booking' + (assigned !== 1 ? 's' : '') + ' have had a worker assigned.';
  } else {
    workerText = 'No worker assigned yet — admin will assign one soon.';
  }

  var completedText;
  if (lastWorker) {
    completedText = 'Last completed by <strong>' + lastWorker.name + '</strong> on <strong>' + formatDate(lastDone.date) + '</strong>.';
  } else if (completed) {
    completedText = completed + ' pickup' + (completed !== 1 ? 's' : '') + ' completed successfully.';
  } else {
    completedText = 'No completed pickups yet.';
  }

  el.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--green-soft)">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">📋</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-900)">Booking Created</div>' +
        '<div style="font-size:12px;color:var(--text-500);margin-top:2px">You have submitted <strong>' + booked + '</strong> pickup request' + (booked !== 1 ? 's' : '') + ' so far.</div>' +
      '</div>' +
      '<div style="font-family:\'Fraunces\',serif;font-size:22px;font-weight:800;color:var(--green)">' + booked + '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--green-soft)">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">👷</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-900)">Worker Assigned</div>' +
        '<div style="font-size:12px;color:var(--text-500);margin-top:2px">' + workerText + '</div>' +
      '</div>' +
      '<div style="font-family:\'Fraunces\',serif;font-size:22px;font-weight:800;color:#3B82F6">' + assigned + '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">✅</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-900)">Pickup Completed</div>' +
        '<div style="font-size:12px;color:var(--text-500);margin-top:2px">' + completedText + '</div>' +
      '</div>' +
      '<div style="font-family:\'Fraunces\',serif;font-size:22px;font-weight:800;color:#10B981">' + completed + '</div>' +
    '</div>';
}

// ── BOOKINGS TAB ─────────────────────────────────────────────
function renderBookingHistory() {
  const auth  = getAuthUser();
  const tbody = document.getElementById('historyTbody');
  if (!tbody) return;

  let bookings = getBookings().filter(function(b) { return b.userId === auth.userId; });

  if (currentHistoryFilter !== 'all') {
    bookings = bookings.filter(function(b) { return b.status === currentHistoryFilter; });
  }

  bookings.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

  const allUserBookings = getBookings().filter(function(b) { return b.userId === auth.userId; });
  renderBookingStatsRow('bookingStatsRow2', allUserBookings);

  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-300)">' +
      '<div style="font-size:32px;margin-bottom:8px">📋</div>' +
      '<div>' + (currentHistoryFilter === 'all' ? 'No bookings yet.' : 'No ' + currentHistoryFilter + ' bookings.') + '</div>' +
      '</td></tr>';
    return;
  }

  const workers = getWorkers();

  tbody.innerHTML = bookings.map(function(b) {
    const types = Array.isArray(b.wasteTypes)
      ? b.wasteTypes.map(function(t) {
          return '<span style="background:var(--green-soft);color:var(--green-dark);border:1px solid var(--green-mid);border-radius:100px;padding:2px 8px;font-size:11px;font-weight:700;margin-right:3px">' + t + '</span>';
        }).join('')
      : '<span style="background:var(--green-soft);color:var(--green-dark);border:1px solid var(--green-mid);border-radius:100px;padding:2px 8px;font-size:11px;font-weight:700">' + (b.wasteType || '—') + '</span>';

    const worker     = b.workerId ? workers.find(function(w) { return w.id === b.workerId; }) : null;
    const workerName = worker ? worker.name : (b.workerName || '—');
    const canCancel  = b.status === 'Pending';
    const actionBtn  = canCancel
      ? '<button onclick="cancelBooking(\'' + b.id + '\')" style="background:var(--red-light);color:var(--red);border:1px solid var(--red);border-radius:100px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer">Cancel</button>'
      : '—';

    return '<tr>' +
      '<td style="font-family:monospace;font-size:11px;color:var(--text-300)">' + b.id + '</td>' +
      '<td>' + types + '</td>' +
      '<td style="font-size:12px;white-space:nowrap">' + formatDate(b.date) + '</td>' +
      '<td style="font-size:12px;color:var(--text-500)">' + (b.timeSlot || '—') + '</td>' +
      '<td style="font-size:12px">' + (b.recurrence || 'One-time') + '</td>' +
      '<td>' + statusBadge(b.status) + '</td>' +
      '<td style="font-size:12px;font-weight:' + (worker ? '600' : '400') + ';color:' + (worker ? 'var(--text-900)' : 'var(--text-300)') + '">' +
        (worker ? '👷 ' + workerName : workerName) +
      '</td>' +
      '<td style="font-size:12px;color:var(--text-500);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (b.notes || '—') + '</td>' +
      '<td>' + actionBtn + '</td>' +
      '</tr>';
  }).join('');
}

function filterHistory(status, chipEl) {
  currentHistoryFilter = status;
  document.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.remove('active'); });
  if (chipEl) chipEl.classList.add('active');
  renderBookingHistory();
}

// ── WORKERS TAB ──────────────────────────────────────────────
function renderWorkersTab() {
  const auth    = getAuthUser();
  const workers = getWorkers();

  const users  = getUsers();
  const me     = users.find(function(u) { return u.id === auth.userId; });
  const myZone = me ? normaliseZone(me.address || '') : '';

  const allTbody = document.getElementById('allWorkersTbody');
  if (allTbody) {
    const active = workers.filter(function(w) { return w.status === 'Active'; });
    if (!active.length) {
      allTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-300)">No active workers</td></tr>';
    } else {
      allTbody.innerHTML = active.map(function(w) {
        return '<tr>' +
          '<td style="font-family:monospace;font-size:11px;color:var(--text-300)">' + w.id + '</td>' +
          '<td style="font-weight:600">' + w.name + '</td>' +
          '<td style="font-size:12px;color:var(--text-500)">' + (w.zone || '—') + '</td>' +
          '<td style="font-size:12px;font-family:monospace">' + (w.phone || '—') + '</td>' +
          '<td style="text-align:center">' + (w.assignedBookings || 0) + '</td>' +
          '<td><span style="color:var(--green);font-size:11px;font-weight:700">● Active</span></td>' +
          '</tr>';
      }).join('');
    }
  }

  const grid = document.getElementById('workersGrid');
  if (grid) {
    const zoneWorkers = workers.filter(function(w) { return normaliseZone(w.zone) === myZone && w.status === 'Active'; });
    if (!zoneWorkers.length) {
      grid.innerHTML = '<div style="color:var(--text-300);font-size:13px;padding:12px">No workers assigned to your zone yet.</div>';
    } else {
      grid.innerHTML = zoneWorkers.map(function(w) {
        return '<div class="worker-card">' +
          '<div class="worker-avatar">' + w.name.charAt(0) + '</div>' +
          '<div>' +
            '<div class="worker-name">' + w.name + '</div>' +
            '<div class="worker-zone">📍 ' + w.zone + '</div>' +
            '<div class="worker-phone">' + (w.phone || '—') + '</div>' +
            '<div class="w-status-active">● Active</div>' +
          '</div>' +
          '</div>';
      }).join('');
    }
  }

  const myCard = document.getElementById('myWorkerCard');
  if (myCard) {
    const myBookings = getBookings().filter(function(b) { return b.userId === auth.userId && b.status === 'Assigned' && b.workerId; });
    myBookings.sort(function(a, b) { return b.date.localeCompare(a.date); });
    const latest         = myBookings[0] || null;
    const assignedWorker = latest ? workers.find(function(w) { return w.id === latest.workerId; }) : null;

    if (assignedWorker) {
      myCard.innerHTML =
        '<div style="background:linear-gradient(135deg,var(--green-soft),#E0F7EE);border:1.5px solid var(--green-mid);border-radius:var(--radius);padding:20px;display:flex;align-items:center;gap:16px">' +
          '<div style="width:52px;height:52px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0">' + assignedWorker.name.charAt(0) + '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--green-dark);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Your Assigned Worker</div>' +
            '<div style="font-size:18px;font-weight:800">' + assignedWorker.name + '</div>' +
            '<div style="font-size:12px;color:var(--text-500);margin-top:2px">📍 ' + (assignedWorker.zone || '—') + ' &nbsp;·&nbsp; 📞 ' + (assignedWorker.phone || '—') + '</div>' +
          '</div>' +
          '<div style="margin-left:auto;text-align:right">' +
            '<div style="font-size:10px;color:var(--text-300)">Booking</div>' +
            '<div style="font-family:monospace;font-size:12px;font-weight:700">' + latest.id + '</div>' +
            '<div style="font-size:11px;color:var(--text-500);margin-top:2px">' + formatDate(latest.date) + '</div>' +
          '</div>' +
        '</div>';
    } else {
      myCard.innerHTML = '<div style="background:var(--green-soft);border-radius:var(--radius);padding:16px;font-size:13px;color:var(--text-500)">No worker currently assigned to your active bookings.</div>';
    }
  }
}

// ── PROFILE TAB ──────────────────────────────────────────────
async function loadAndRenderProfile() {
  const auth = getAuthUser();
  if (!auth.userId) return;

  let user;
  try {
    user = await apiGetProfile(auth.userId);
  } catch (e) {
    user = getUsers().find(function(u) { return u.id === auth.userId; });
    if (!user) user = { name: auth.name, email: auth.email, phone: '', address: '', totalBookings: 0 };
  }

  populateProfile(user);
}

function populateProfile(user) {
  setText('profileName',   user.name  || '—');
  setText('profileEmail',  user.email || '—');
  setText('profileTotal',  user.totalBookings || 0);
  setText('profileRating', user.rating ? parseFloat(user.rating).toFixed(1) + ' ★' : '—');
  setText('profileSince',  user.memberSince || '—');
  setText('profileSince2', user.memberSince || '—');

  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();

  setVal('editName',    user.name    || '');
  setVal('editEmail',   user.email   || '');
  setVal('editPhone',   user.phone   || '');
  setVal('editAddress', user.address || '');

  setText('profileId', user.id || '—');

  const isPriority = (user.totalBookings || 0) >= 10;
  setText('profilePrioStatus', isPriority ? '⭐ Priority Member' : 'Standard');

  const badge = document.getElementById('profilePriorityBadge');
  if (badge) badge.style.display = isPriority ? 'block' : 'none';

  const sbPriority = document.getElementById('sbPriority');
  if (sbPriority) sbPriority.style.display = isPriority ? 'flex' : 'none';

  const total = user.totalBookings || 0;
  const pct   = Math.min(Math.round((total / 10) * 100), 100);
  setText('prioProgress', total + ' / 10');
  const bar = document.getElementById('prioBar');
  if (bar) bar.style.width = pct + '%';

  const sbAvatar = document.getElementById('sbAvatar');
  const sbName   = document.getElementById('sbName');
  const sbEmail  = document.getElementById('sbEmail');
  if (sbAvatar) sbAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
  if (sbName)   sbName.textContent   = user.name || '—';
  if (sbEmail)  sbEmail.textContent  = user.email || '';

  const bAddr = document.getElementById('bAddress');
  if (bAddr) bAddr.textContent = '📍 ' + (user.address || 'Address not set');
}

async function saveProfile() {
  const auth = getAuthUser();
  if (!auth.userId) return;

  const name  = document.getElementById('editName')?.value.trim()  || '';
  const phone = document.getElementById('editPhone')?.value.trim() || '';

  if (!name) {
    showToast('Name cannot be empty.', 'error');
    return;
  }

  const btn = document.querySelector('[onclick="saveProfile()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const updated = await apiUpdateProfile(auth.userId, { name, phone });
    populateProfile(updated);
    showToast('Profile saved! ✓', 'success');
  } catch (e) {
    showToast(e.message || 'Failed to save.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

// ── BOOKING MODAL ────────────────────────────────────────────
function openBookingModal() {
  selectedWasteTypes = [];

  document.querySelectorAll('.waste-option').forEach(function(el) { el.classList.remove('selected'); });

  setVal('bDate', '');
  setVal('bTimeSlot', '');
  setVal('bRecurrence', 'One-time');
  setVal('bNotes', '');

  ['bTypeErr','bDateErr','bSlotErr'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });

  const auth = getAuthUser();
  const me   = getUsers().find(function(u) { return u.id === auth.userId; });
  const prioNote = document.getElementById('bPriorityNote');
  if (prioNote) prioNote.style.display = (me && me.totalBookings >= 10) ? 'block' : 'none';

  const bAddr = document.getElementById('bAddress');
  if (bAddr && me) bAddr.textContent = '📍 ' + (me.address || 'Address not set');

  const overlay = document.getElementById('bookingOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeBookingModal() {
  const overlay = document.getElementById('bookingOverlay');
  if (overlay) overlay.classList.remove('open');
}

function closeIfOverlay(event) {
  if (event.target === event.currentTarget) closeBookingModal();
}

function toggleWaste(type, chipEl) {
  const idx = selectedWasteTypes.indexOf(type);
  if (idx === -1) {
    selectedWasteTypes.push(type);
    if (chipEl) chipEl.classList.add('selected');
  } else {
    selectedWasteTypes.splice(idx, 1);
    if (chipEl) chipEl.classList.remove('selected');
  }
  if (selectedWasteTypes.length) {
    const err = document.getElementById('bTypeErr');
    if (err) err.classList.remove('show');
  }
}

async function submitBooking() {
  const date       = document.getElementById('bDate')?.value       || '';
  const timeSlot   = document.getElementById('bTimeSlot')?.value   || '';
  const recurrence = document.getElementById('bRecurrence')?.value || 'One-time';
  const notes      = document.getElementById('bNotes')?.value.trim() || '';

  let valid = true;
  if (!selectedWasteTypes.length) {
    const e = document.getElementById('bTypeErr');
    if (e) e.classList.add('show');
    valid = false;
  }
  if (!date) {
    const e = document.getElementById('bDateErr');
    if (e) e.classList.add('show');
    valid = false;
  }
  if (!timeSlot) {
    const e = document.getElementById('bSlotErr');
    if (e) e.classList.add('show');
    valid = false;
  }
  if (!valid) return;

  const btn = document.querySelector('.modal-footer .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Booking…'; }

  try {
    await apiCreateBooking(selectedWasteTypes, date, timeSlot, recurrence, notes);
    showToast('Pickup booked! 🎉', 'success');
    closeBookingModal();
    renderDashboardTab();
    renderBookingHistory();
    renderWorkersTab();
  } catch (e) {
    showToast(e.message || 'Booking failed. Is the server running?', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Booking'; }
  }
}

// ── Cancel booking ───────────────────────────────────────────
async function cancelBooking(bookingId) {
  if (!confirm('Cancel this booking?')) return;
  try {
    await apiUpdateBookingStatus(bookingId, 'Cancelled');
    showToast('Booking cancelled.', 'success');
    renderDashboardTab();
    renderBookingHistory();
  } catch (e) {
    showToast(e.message || 'Could not cancel.', 'error');
  }
}

// ── Tab navigation ───────────────────────────────────────────
function showTab(tab, el) {
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.sb-link').forEach(function(n) { n.classList.remove('active'); });
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');

  const titles = { dashboard: 'Dashboard', bookings: 'My Bookings', workers: 'Assigned Workers', profile: 'My Profile' };
  setText('pageTitle', titles[tab] || tab);

  if (tab === 'dashboard') renderDashboardTab();
  if (tab === 'bookings')  renderBookingHistory();
  if (tab === 'workers')   renderWorkersTab();
  if (tab === 'profile')   loadAndRenderProfile();
}

// ── Logout ───────────────────────────────────────────────────
function logout() { apiLogout(); }

// ── Helpers ──────────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d        = new Date(iso);
    const adjusted = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return adjusted.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return iso; }
}

function statusBadge(status) {
  const cfg = {
    Pending:   { color: '#F59E0B', bg: '#FFFBEB', dot: '🟡' },
    Assigned:  { color: '#3B82F6', bg: '#EFF6FF', dot: '🔵' },
    Completed: { color: '#10B981', bg: '#ECFDF5', dot: '🟢' },
    Cancelled: { color: '#EF4444', bg: '#FEF2F2', dot: '🔴' },
  };
  const s = cfg[status] || { color: '#888', bg: '#f5f5f5', dot: '⚪' };
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:100px;background:' + s.bg + ';color:' + s.color + ';font-size:11px;font-weight:700;white-space:nowrap">' + s.dot + ' ' + status + '</span>';
}

function showToast(msg, type) {
  if (!type) type = 'success';
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.classList.remove('show'); }, 3200);
}