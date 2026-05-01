// ============================================================
//  TrashDash — Admin Application Logic
//  Depends on: api-bridge.js (must load first)
//  NO localStorage — all data from window._tdCache via refreshStore()
// ============================================================

// ── State ────────────────────────────────────────────────────
let weeklyChart, wasteChart, monthlyChart, zoneChart, workerPerfChart;
let showingPriorityOnly = false;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setDate();

  // Wait for api-bridge.js bootstrap to finish, then pull fresh data
  await window.isDataReady;
  if (typeof refreshStore === 'function') await refreshStore();

  updateStatCards();
  renderOverviewExtras();
  renderBookings();
  renderUsers();
  renderWorkers();
  updatePendingBadge();

  setTimeout(() => {
    initWeeklyChart();
    initWasteChart();
    initMonthlyChart();
    initZoneChart();
    initWorkerPerfChart();
    initAnalyticsKpis();
  }, 150);
});

// ── Date ─────────────────────────────────────────────────────
function setDate() {
  const el = document.getElementById('pageDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-PK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ── Navigation ───────────────────────────────────────────────
function showSection(name, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + name)?.classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    overview: 'Overview', bookings: 'Manage Bookings',
    users: 'User Registry', workers: 'Worker Management', analytics: 'Analytics',
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;

  // Refresh cache on every section switch so data is always current
  if (typeof refreshStore === 'function') {
    refreshStore().then(() => {
      if (name === 'users')     renderUsers();
      if (name === 'bookings')  renderBookings();
      if (name === 'workers')   renderWorkers();
      if (name === 'overview')  { updateStatCards(); renderOverviewExtras(); }
      if (name === 'analytics') initAnalyticsKpis();
    });
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('closed');
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('mainWrap').classList.toggle('expanded');
}

// ── Stat cards ───────────────────────────────────────────────
function updateStatCards() {
  const bookings = getBookings();
  const users    = getUsers();
  const workers  = getWorkers();
  const today    = new Date().toISOString().slice(0, 10);

  document.getElementById('statUsers').textContent    = users.length;
  document.getElementById('statWorkers').textContent  = workers.filter(w => w.status === 'Active').length;
  document.getElementById('statPending').textContent  = bookings.filter(b => b.status === 'Pending').length;
  document.getElementById('statToday').textContent    = bookings.filter(b => b.date === today).length;
}

function updatePendingBadge() {
  const count = getBookings().filter(b => b.status === 'Pending').length;
  const badge = document.getElementById('pendingBadge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

// ── Overview extras ──────────────────────────────────────────
function renderOverviewExtras() {
  renderRecentBookings();
  renderZoneBars();
}

function renderRecentBookings() {
  const tbody = document.querySelector('#recentBookingsTable tbody');
  if (!tbody) return;
  const bookings = getBookings().slice(-5).reverse();
  tbody.innerHTML = bookings.map(b => {
    const typeLabel = Array.isArray(b.wasteTypes)
      ? b.wasteTypes.join(', ')
      : (b.wasteType || '—');
    return `
      <tr>
        <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted)">${b.id}</td>
        <td style="font-weight:500">${b.userName}</td>
        <td><span class="badge" style="background:var(--green-light);color:var(--green-dark);border:1px solid var(--green-mid)">${typeLabel}</span></td>
        <td>${badgeHtml(b.status)}</td>
      </tr>
    `;
  }).join('');
}

function renderZoneBars() {
  const container = document.getElementById('zoneBars');
  if (!container) return;
  const zones = {};
  getBookings().forEach(b => { zones[b.zone] = (zones[b.zone] || 0) + 1; });
  const max = Math.max(...Object.values(zones), 1);
  container.innerHTML = Object.entries(zones)
    .sort((a, b) => b[1] - a[1])
    .map(([z, c]) => `
      <div class="zone-bar-item">
        <div class="zone-bar-label">
          <span>${z.replace(', Rawalpindi', '')}</span>
          <span>${c}</span>
        </div>
        <div class="zone-bar-track">
          <div class="zone-bar-fill" style="width:${Math.round(c / max * 100)}%"></div>
        </div>
      </div>
    `).join('');
}

// ── Bookings table ───────────────────────────────────────────
function renderBookings() {
  const tbody = document.getElementById('bookingsTbody');
  if (!tbody) return;

  let bookings = getBookings();
  const fStatus = document.getElementById('filterStatus')?.value || '';
  const fZone   = document.getElementById('filterZone')?.value   || '';
  const fType   = document.getElementById('filterType')?.value   || '';
  const fSearch = (document.getElementById('searchBookings')?.value || '').toLowerCase();

  if (fStatus) bookings = bookings.filter(b => b.status === fStatus);
  if (fZone)   bookings = bookings.filter(b => normaliseZone(b.zone) === fZone);
  if (fType)   bookings = bookings.filter(b => {
    const types = Array.isArray(b.wasteTypes) ? b.wasteTypes : [b.wasteType];
    return types.includes(fType);
  });
  if (fSearch) bookings = bookings.filter(b =>
    b.userName.toLowerCase().includes(fSearch) || b.id.toLowerCase().includes(fSearch)
  );

  const users   = getUsers();
  const workers = getWorkers();

  tbody.innerHTML = bookings.map(b => {
    const user             = users.find(u => u.id === b.userId);
    const priority         = user && isPriorityUser(user);
    const bookingZoneNorm  = normaliseZone(b.zone);
    const zoneWorkers      = workers.filter(w =>
      normaliseZone(w.zone) === bookingZoneNorm && w.status === 'Active'
    );
    const assignedWorkerName = b.workerId
      ? (workers.find(w => w.id === b.workerId)?.name || '—')
      : '—';
    const canAssign = b.status === 'Pending' || b.status === 'Assigned';

    // Render waste types — handle both array (new) and string (legacy)
    const typeLabel = Array.isArray(b.wasteTypes)
      ? b.wasteTypes.map(t => `<span class="badge" style="background:var(--green-light);color:var(--green-dark);border:1px solid var(--green-mid)">${t}</span>`).join(' ')
      : `<span class="badge" style="background:var(--green-light);color:var(--green-dark);border:1px solid var(--green-mid)">${b.wasteType || '—'}</span>`;

    return `
      <tr class="${priority ? 'priority-row' : ''}">
        <td>
          <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted)">${b.id}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--green);color:#fff;
                        display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">
              ${b.userName.charAt(0)}
            </div>
            <div>
              <div style="font-weight:600;font-size:13px">${b.userName}</div>
              ${priority ? '<span class="badge badge-priority" style="font-size:9px;padding:1px 6px">⭐ Priority</span>' : ''}
            </div>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text-soft)">${bookingZoneNorm}</td>
        <td>${typeLabel}</td>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${formatDate(b.date)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${b.timeSlot || '—'}</td>
        <td>${badgeHtml(b.status)}</td>
        <td>
          ${canAssign
            ? buildWorkerDropdown(b.id, b.workerId, zoneWorkers, bookingZoneNorm)
            : `<span style="font-size:12px;color:var(--text-muted)">${assignedWorkerName}</span>`}
        </td>
        <td>
          ${b.status !== 'Completed' && b.status !== 'Cancelled'
            ? `<button class="icon-btn" title="Mark Completed" onclick="updateStatus('${b.id}','Completed')">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
               </button>`
            : ''}
          ${b.status !== 'Cancelled'
            ? `<button class="icon-btn danger" title="Cancel Booking" onclick="updateStatus('${b.id}','Cancelled')">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
               </button>`
            : ''}
        </td>
      </tr>
    `;
  }).join('') || `
    <tr>
      <td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">
        No bookings found matching your filters.
      </td>
    </tr>`;

  document.getElementById('bookingCount').textContent =
    `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`;
}

function buildWorkerDropdown(bookingId, currentWorkerId, zoneWorkers, zoneName) {
  if (!zoneWorkers.length) {
    return `<span style="font-size:11px;color:var(--red);font-weight:600">⚠ No active workers in ${zoneName}</span>`;
  }
  const options = zoneWorkers.map(w => `
    <option value="${w.id}" ${currentWorkerId === w.id ? 'selected' : ''}>
      ${w.name}${currentWorkerId === w.id ? ' ✓' : ''}
    </option>
  `).join('');
  return `
    <select class="assign-select" onchange="assignWorker('${bookingId}', this.value)">
      <option value="">— Assign Worker —</option>
      ${options}
    </select>
  `;
}

// ── Assign worker ────────────────────────────────────────────
function assignWorker(bookingId, workerId) {
  if (!workerId) return;
  apiAssignWorker(bookingId, workerId)
    .then(() => refreshStore())
    .then(() => {
      renderBookings();
      renderWorkers();
      updateStatCards();
      updatePendingBadge();
      renderOverviewExtras();
      const w = getWorkers().find(w => w.id === workerId);
      showToast(`✓ ${w?.name || workerId} assigned to booking ${bookingId}`, 'success');
    })
    .catch(e => showToast('Assign failed: ' + e.message, 'error'));
}

// ── Update booking status ────────────────────────────────────
function updateStatus(bookingId, newStatus) {
  apiUpdateBookingStatus(bookingId, newStatus)
    .then(() => refreshStore())
    .then(() => {
      renderBookings();
      renderWorkers();
      updateStatCards();
      updatePendingBadge();
      renderOverviewExtras();
      showToast(`Booking ${bookingId} marked as ${newStatus}`, 'success');
    })
    .catch(e => showToast('Update failed: ' + e.message, 'error'));
}

// ── Export CSV ───────────────────────────────────────────────
function exportBookings() {
  const workers = getWorkers();
  const headers = ['ID', 'Resident', 'Zone', 'Waste Types', 'Date', 'Time Slot', 'Recurrence', 'Status', 'Assigned Worker', 'Notes'];
  const rows = getBookings().map(b => {
    const typeStr = Array.isArray(b.wasteTypes) ? b.wasteTypes.join(' | ') : (b.wasteType || '');
    return [
      b.id, b.userName, b.zone, typeStr, b.date, b.timeSlot, b.recurrence, b.status,
      b.workerId ? (workers.find(w => w.id === b.workerId)?.name || '') : '',
      `"${(b.notes || '').replace(/"/g, '""')}"`,
    ];
  });
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'trashdash-bookings.csv';
  a.click();
  showToast('CSV exported!', 'success');
}

// ── Users table ──────────────────────────────────────────────
function renderUsers(filterPriority = showingPriorityOnly) {
  showingPriorityOnly = filterPriority;
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  let users = getUsers();
  console.log('[TrashDash] Rendering users table —', users.length, 'users in cache');

  const q = (document.getElementById('searchUsers')?.value || '').toLowerCase();
  if (q)             users = users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (filterPriority) users = users.filter(u => isPriorityUser(u));

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:var(--green);color:#fff;
                      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">
            ${(u.name || 'U').charAt(0)}
          </div>
          <div>
            <div style="font-weight:600">${u.name}</div>
            ${isPriorityUser(u) ? '<span class="badge badge-priority" style="font-size:9px;padding:1px 6px">⭐ Priority</span>' : ''}
          </div>
        </div>
      </td>
      <td style="color:var(--text-soft);font-size:13px">${u.email}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${u.phone || '—'}</td>
      <td style="font-size:12px;color:var(--text-soft)">${u.address || '—'}</td>
      <td style="text-align:center">
        <span style="font-family:'DM Mono',monospace;font-weight:700;
                     color:${isPriorityUser(u) ? 'var(--amber)' : 'var(--text-main)'}">
          ${u.totalBookings || 0}
        </span>
      </td>
      <td>⭐ <strong>${u.rating || '—'}</strong></td>
      <td style="font-size:12px;color:var(--text-muted)">${u.memberSince || '—'}</td>
      <td>
        <span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">
          ${u.status || 'Active'}
        </span>
      </td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No users found</td>
    </tr>`;
}

function filterPriorityUsers() {
  showingPriorityOnly = !showingPriorityOnly;
  renderUsers(showingPriorityOnly);
  const btn = document.querySelector('[onclick="filterPriorityUsers()"]');
  if (btn) btn.style.color = showingPriorityOnly ? 'var(--amber)' : '';
}

// ── Workers table ────────────────────────────────────────────
function renderWorkers() {
  const tbody = document.getElementById('workersTbody');
  if (!tbody) return;

  let workers = getWorkers();
  const q = (document.getElementById('searchWorkers')?.value || '').toLowerCase();
  if (q) workers = workers.filter(w =>
    w.name.toLowerCase().includes(q) || w.zone.toLowerCase().includes(q)
  );

  tbody.innerHTML = workers.map((w, i) => `
    <tr>
      <td><span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted)">${w.id}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:var(--blue);opacity:.85;color:#fff;
                      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">
            ${w.name.charAt(0)}
          </div>
          <div>
            <div style="font-weight:600">${w.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">
              <a href="worker.html?worker=${w.id}" target="_blank"
                 style="color:var(--green);font-weight:600;text-decoration:none">View Portal ↗</a>
            </div>
          </div>
        </div>
      </td>
      <td style="font-size:13px;color:var(--text-soft)">${w.zone}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${w.phone}</td>
      <td style="text-align:center;font-family:'DM Mono',monospace;font-weight:700">${w.assignedBookings || 0}</td>
      <td>
        <input type="checkbox" id="toggle-${i}" class="toggle-input"
               ${w.status === 'Active' ? 'checked' : ''}
               onchange="toggleWorkerStatus('${w.id}')">
        <label for="toggle-${i}" class="toggle-label"></label>
        <span style="font-size:12px;margin-left:6px;color:${w.status === 'Active' ? 'var(--green)' : 'var(--text-muted)'}">
          ${w.status}
        </span>
      </td>
      <td>
        <button class="icon-btn danger" title="Remove Worker" onclick="removeWorker('${w.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('') || `
    <tr>
      <td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No workers found</td>
    </tr>`;
}

function toggleWorkerStatus(wId) {
  const w = getWorkers().find(w => w.id === wId);
  if (!w) return;
  const newStatus = w.status === 'Active' ? 'Inactive' : 'Active';
  apiUpdateWorker(wId, { status: newStatus })
    .then(() => refreshStore())
    .then(() => { renderWorkers(); updateStatCards(); renderBookings(); })
    .catch(e => showToast('Failed: ' + e.message, 'error'));
  showToast(`${w.name} is now ${newStatus}`, 'success');
}

function removeWorker(wId) {
  if (!confirm('Remove this worker?')) return;
  apiDeleteWorker(wId)
    .then(() => refreshStore())
    .then(() => { renderWorkers(); renderBookings(); updateStatCards(); updatePendingBadge(); showToast('Worker removed', 'success'); })
    .catch(e => showToast('Failed: ' + e.message, 'error'));
}

// ── Modals ───────────────────────────────────────────────────
function openAddWorkerModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('addWorkerModal').classList.add('open');
}
function openAddUserModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('addUserModal').classList.add('open');
}
function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  document.getElementById('modalOverlay').classList.remove('open');
}

function addWorker() {
  const name  = document.getElementById('wName').value.trim();
  const zone  = document.getElementById('wZone').value;
  const phone = document.getElementById('wPhone').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  apiCreateWorker(name, zone, phone)
    .then(() => refreshStore())
    .then(() => {
      closeModal();
      renderWorkers();
      updateStatCards();
      showToast(`Worker ${name} added!`, 'success');
      ['wName', 'wId', 'wPhone'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    })
    .catch(e => showToast('Failed to add worker: ' + e.message, 'error'));
}

function addUser() {
  const name    = document.getElementById('uName').value.trim();
  const email   = document.getElementById('uEmail').value.trim();
  const phone   = document.getElementById('uPhone').value.trim();
  const address = document.getElementById('uAddress').value;

  if (!name || !email) { showToast('Name and email are required', 'error'); return; }

  // Duplicate check against cache (fast, no extra request)
  if (getUsers().find(u => u.email.toLowerCase() === email.toLowerCase())) {
    showToast('Email already registered', 'error'); return;
  }

  apiCreateUser(name, email, phone, address)
    .then(() => refreshStore())
    .then(() => {
      closeModal();
      renderUsers();
      updateStatCards();
      showToast(`User ${name} added!`, 'success');
      ['uName', 'uEmail', 'uPhone'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    })
    .catch(e => showToast('Failed to add user: ' + e.message, 'error'));
}

// ── Analytics KPIs ───────────────────────────────────────────
function initAnalyticsKpis() {
  const el = document.getElementById('analyticsKpis');
  if (!el) return;
  const bookings  = getBookings();
  const completed = bookings.filter(b => b.status === 'Completed');
  const rated     = completed.filter(b => b.rating);
  const avgRating = rated.length
    ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
    : '—';

  const kpis = [
    { label: 'Total Bookings',     value: bookings.length },
    { label: 'Completion Rate',    value: Math.round(completed.length / (bookings.length || 1) * 100) + '%' },
    { label: 'Avg Service Rating', value: avgRating !== '—' ? avgRating + ' ★' : '—' },
    { label: 'Priority Users',     value: getUsers().filter(isPriorityUser).length },
  ];

  el.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>
  `).join('');
}

// ── Charts ───────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { font: { family: 'DM Sans', size: 12 }, color: '#5a7a6a' } },
  },
};

function initWeeklyChart() {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Pickups', data: [12, 8, 15, 10, 18, 7, 14],
        backgroundColor: '#0d9a6a', borderRadius: 8, borderSkipped: false,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        y: { grid: { color: '#f0f9f4' }, ticks: { color: '#94b3a0' } },
        x: { grid: { display: false }, ticks: { color: '#94b3a0' } },
      },
    },
  });
}

function initWasteChart() {
  const ctx = document.getElementById('wasteChart');
  if (!ctx) return;
  const typeCounts = {};
  getBookings().forEach(b => {
    const types = Array.isArray(b.wasteTypes) ? b.wasteTypes : [b.wasteType];
    types.forEach(t => { if (t) typeCounts[t] = (typeCounts[t] || 0) + 1; });
  });
  const colors = ['#0d9a6a', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
  wasteChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(typeCounts),
      datasets: [{
        data: Object.values(typeCounts),
        backgroundColor: colors.slice(0, Object.keys(typeCounts).length),
        borderWidth: 2, borderColor: '#fff',
      }],
    },
    options: { ...CHART_DEFAULTS, cutout: '65%' },
  });
}

function initMonthlyChart() {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;
  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [{
        label: 'Pickups', data: [22, 18, 35, 28, 40, 32, 45, 38, 50, 42, 55, 48],
        borderColor: '#0d9a6a', backgroundColor: 'rgba(13,154,106,.08)',
        borderWidth: 2.5, pointBackgroundColor: '#0d9a6a', pointRadius: 4, tension: 0.4, fill: true,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        y: { grid: { color: '#f0f9f4' }, ticks: { color: '#94b3a0' } },
        x: { grid: { display: false }, ticks: { color: '#94b3a0' } },
      },
    },
  });
}

function initZoneChart() {
  const ctx = document.getElementById('zoneChart');
  if (!ctx) return;
  const zones = {};
  getBookings().forEach(b => {
    const z = normaliseZone(b.zone);
    zones[z] = (zones[z] || 0) + 1;
  });
  zoneChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(zones),
      datasets: [{
        label: 'Bookings', data: Object.values(zones),
        backgroundColor: ['#0d9a6a', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'],
        borderRadius: 8, borderSkipped: false,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      scales: {
        x: { grid: { color: '#f0f9f4' }, ticks: { color: '#94b3a0' } },
        y: { grid: { display: false }, ticks: { color: '#5a7a6a', font: { size: 11 } } },
      },
    },
  });
}

function initWorkerPerfChart() {
  const ctx = document.getElementById('workerPerfChart');
  if (!ctx) return;
  const workers = getWorkers().filter(w => w.status === 'Active').slice(0, 3);
  workerPerfChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Pickups', 'Ratings', 'Zones', 'Speed', 'Compliance'],
      datasets: workers.map((w, i) => ({
        label: w.name.split(' ')[0],
        data: [
          Math.round(Math.random() * 5 + 3),
          Math.round(Math.random() * 3 + 6),
          Math.round(Math.random() * 4 + 4),
          Math.round(Math.random() * 3 + 6),
          Math.round(Math.random() * 2 + 7),
        ],
        borderColor:     ['#0d9a6a', '#3b82f6', '#f59e0b'][i],
        backgroundColor: ['rgba(13,154,106,.1)', 'rgba(59,130,246,.1)', 'rgba(245,158,11,.1)'][i],
        borderWidth: 2,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        r: {
          ticks: { display: false },
          grid: { color: '#e6f7f1' },
          pointLabels: { color: '#5a7a6a', font: { size: 11 } },
        },
      },
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────
function badgeHtml(status) {
  const map  = { Pending: 'badge-pending', Assigned: 'badge-assigned', Completed: 'badge-completed', Cancelled: 'badge-cancelled' };
  const dots = { Pending: '🟡', Assigned: '🔵', Completed: '🟢', Cancelled: '🔴' };
  return `<span class="badge ${map[status] || ''}">${dots[status] || ''} ${status}</span>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3200);
}