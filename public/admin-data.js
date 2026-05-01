// ============================================================
//  TrashDash — Shared Data Store
//  Single source of truth for Admin + Resident modules.
//  Uses localStorage for persistence.
// ============================================================

const STORAGE_KEYS = {
  BOOKINGS: 'td_bookings',
  USERS:    'td_users',
  WORKERS:  'td_workers',
};

// ---- SEED WORKERS ------------------------------------------
// NOTE: zones stored WITHOUT ", Rawalpindi" suffix
// The zone-match helper normalises booking zones to match.
const SEED_WORKERS = [
  { id: 'W-001', name: 'Muhammad Akram',  zone: 'Satellite Town',  phone: '+92-311-1234567', status: 'Active',   assignedBookings: 2 },
  { id: 'W-002', name: 'Kashif Mahmood',  zone: 'Satellite Town',  phone: '+92-322-2345678', status: 'Active',   assignedBookings: 0 },
  { id: 'W-003', name: 'Tariq Hussain',   zone: 'Bahria Town',     phone: '+92-333-3456789', status: 'Active',   assignedBookings: 1 },
  { id: 'W-004', name: 'Imran Butt',      zone: 'Gulraiz Housing', phone: '+92-344-4567890', status: 'Inactive', assignedBookings: 0 },
  { id: 'W-005', name: 'Zubair Shah',     zone: 'Chaklala',        phone: '+92-355-5678901', status: 'Active',   assignedBookings: 2 },
  { id: 'W-006', name: 'Asif Raza',       zone: 'Pir Wadhai',      phone: '+92-366-6789012', status: 'Active',   assignedBookings: 1 },
];

// ---- SEED USERS --------------------------------------------
const SEED_USERS = [
  { id: 'U-001', name: 'Ahmed Hassan',  email: 'ahmed@example.com',  phone: '+92-300-1234567', address: 'Satellite Town, Rawalpindi', totalBookings: 24, rating: 4.8, memberSince: 'Jan 2025', status: 'Active'   },
  { id: 'U-002', name: 'Sara Khan',     email: 'sara@example.com',   phone: '+92-301-2345678', address: 'Bahria Town, Rawalpindi',    totalBookings: 15, rating: 4.5, memberSince: 'Feb 2025', status: 'Active'   },
  { id: 'U-003', name: 'Ali Raza',      email: 'ali@example.com',    phone: '+92-302-3456789', address: 'Gulraiz Housing, Rawalpindi',totalBookings: 3,  rating: 4.2, memberSince: 'Mar 2025', status: 'Active'   },
  { id: 'U-004', name: 'Fatima Malik',  email: 'fatima@example.com', phone: '+92-303-4567890', address: 'Chaklala, Rawalpindi',       totalBookings: 12, rating: 4.9, memberSince: 'Jan 2025', status: 'Active'   },
  { id: 'U-005', name: 'Usman Tariq',   email: 'usman@example.com',  phone: '+92-304-5678901', address: 'Satellite Town, Rawalpindi', totalBookings: 8,  rating: 4.0, memberSince: 'Apr 2025', status: 'Active'   },
  { id: 'U-006', name: 'Zara Iqbal',    email: 'zara@example.com',   phone: '+92-305-6789012', address: 'Pir Wadhai, Rawalpindi',     totalBookings: 18, rating: 4.7, memberSince: 'Jan 2025', status: 'Active'   },
  { id: 'U-007', name: 'Hassan Mirza',  email: 'hassan@example.com', phone: '+92-306-7890123', address: 'Bahria Town, Rawalpindi',    totalBookings: 6,  rating: 3.8, memberSince: 'May 2025', status: 'Inactive' },
];

// ---- SEED BOOKINGS -----------------------------------------
// zone field stores full address (matches user.address)
const SEED_BOOKINGS = [
  { id: 'B-001', userId: 'U-001', userName: 'Ahmed Hassan', zone: 'Satellite Town, Rawalpindi',  wasteType: 'Household',  date: '2026-03-18', timeSlot: '08:00 - 10:00', recurrence: 'Weekly',   status: 'Completed', workerId: 'W-001', notes: 'Please collect from the back gate',    rating: 5    },
  { id: 'B-002', userId: 'U-001', userName: 'Ahmed Hassan', zone: 'Satellite Town, Rawalpindi',  wasteType: 'Electronic', date: '2026-03-15', timeSlot: '08:00 - 10:00', recurrence: 'One-time', status: 'Completed', workerId: 'W-002', notes: 'Old computer parts',                   rating: 5    },
  { id: 'B-003', userId: 'U-001', userName: 'Ahmed Hassan', zone: 'Satellite Town, Rawalpindi',  wasteType: 'Recyclable', date: '2026-03-22', timeSlot: '08:00 - 10:00', recurrence: 'Weekly',   status: 'Pending',   workerId: null,    notes: 'Plastic bottles and glass containers', rating: null },
  { id: 'B-004', userId: 'U-001', userName: 'Ahmed Hassan', zone: 'Satellite Town, Rawalpindi',  wasteType: 'Organic',    date: '2026-03-25', timeSlot: '10:00 - 12:00', recurrence: 'Monthly',  status: 'Assigned',  workerId: 'W-001', notes: 'Garden waste and food compost',        rating: null },
  { id: 'B-005', userId: 'U-002', userName: 'Sara Khan',    zone: 'Bahria Town, Rawalpindi',     wasteType: 'Household',  date: '2026-03-20', timeSlot: '10:00 - 12:00', recurrence: 'Weekly',   status: 'Assigned',  workerId: 'W-003', notes: '',                                    rating: null },
  { id: 'B-006', userId: 'U-002', userName: 'Sara Khan',    zone: 'Bahria Town, Rawalpindi',     wasteType: 'Recyclable', date: '2026-03-27', timeSlot: '14:00 - 16:00', recurrence: 'Weekly',   status: 'Pending',   workerId: null,    notes: 'Cardboard boxes',                     rating: null },
  { id: 'B-007', userId: 'U-003', userName: 'Ali Raza',     zone: 'Gulraiz Housing, Rawalpindi', wasteType: 'Organic',    date: '2026-04-01', timeSlot: '08:00 - 10:00', recurrence: 'One-time', status: 'Pending',   workerId: null,    notes: '',                                    rating: null },
  { id: 'B-008', userId: 'U-004', userName: 'Fatima Malik', zone: 'Chaklala, Rawalpindi',        wasteType: 'Electronic', date: '2026-03-19', timeSlot: '12:00 - 14:00', recurrence: 'One-time', status: 'Completed', workerId: 'W-005', notes: 'Old mobile phones',                   rating: 5    },
  { id: 'B-009', userId: 'U-004', userName: 'Fatima Malik', zone: 'Chaklala, Rawalpindi',        wasteType: 'Household',  date: '2026-03-26', timeSlot: '08:00 - 10:00', recurrence: 'Weekly',   status: 'Assigned',  workerId: 'W-005', notes: '',                                    rating: null },
  { id: 'B-010', userId: 'U-005', userName: 'Usman Tariq',  zone: 'Satellite Town, Rawalpindi',  wasteType: 'Hazardous',  date: '2026-03-21', timeSlot: '16:00 - 18:00', recurrence: 'One-time', status: 'Pending',   workerId: null,    notes: 'Old paint cans and batteries',        rating: null },
  { id: 'B-011', userId: 'U-006', userName: 'Zara Iqbal',   zone: 'Pir Wadhai, Rawalpindi',      wasteType: 'Household',  date: '2026-03-23', timeSlot: '10:00 - 12:00', recurrence: 'Weekly',   status: 'Assigned',  workerId: 'W-006', notes: '',                                    rating: null },
  { id: 'B-012', userId: 'U-006', userName: 'Zara Iqbal',   zone: 'Pir Wadhai, Rawalpindi',      wasteType: 'Recyclable', date: '2026-04-06', timeSlot: '10:00 - 12:00', recurrence: 'Weekly',   status: 'Pending',   workerId: null,    notes: '',                                    rating: null },
  { id: 'B-013', userId: 'U-007', userName: 'Hassan Mirza', zone: 'Bahria Town, Rawalpindi',     wasteType: 'Organic',    date: '2026-03-28', timeSlot: '08:00 - 10:00', recurrence: 'One-time', status: 'Cancelled', workerId: null,    notes: '',                                    rating: null },
  { id: 'B-014', userId: 'U-001', userName: 'Ahmed Hassan', zone: 'Satellite Town, Rawalpindi',  wasteType: 'Household',  date: '2026-04-27', timeSlot: '08:00 - 10:00', recurrence: 'Weekly',   status: 'Pending',   workerId: null,    notes: 'Today pickup',                        rating: null },
  { id: 'B-015', userId: 'U-004', userName: 'Fatima Malik', zone: 'Chaklala, Rawalpindi',        wasteType: 'Recyclable', date: '2026-04-27', timeSlot: '12:00 - 14:00', recurrence: 'Weekly',   status: 'Completed', workerId: 'W-005', notes: 'Today pickup',                        rating: null },
];

// ---- ZONE NORMALISER ---------------------------------------
// Strips ", Rawalpindi" suffix so booking zones can match worker zones.
// Call this whenever comparing booking.zone to worker.zone.
function normaliseZone(zone) {
  if (!zone) return '';
  return zone.replace(/,?\s*rawalpindi/i, '').trim();
}

// ---- INIT STORE --------------------------------------------
// Only seeds data if the key doesn't exist yet (first load).
function initStore() {
  if (!localStorage.getItem(STORAGE_KEYS.WORKERS)) {
    localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(SEED_WORKERS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.BOOKINGS)) {
    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(SEED_BOOKINGS));
  }
}

// ---- ACCESSORS ---------------------------------------------
function getBookings() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOKINGS) || '[]');
}
function saveBookings(data) {
  localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(data));
}
function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
}
function saveUsers(data) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data));
}
function getWorkers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKERS) || '[]');
}
function saveWorkers(data) {
  localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(data));
}

// ---- PRIORITY THRESHOLD ------------------------------------
const PRIORITY_THRESHOLD = 10; // users with >= 10 bookings = priority

function isPriorityUser(user) {
  return user.totalBookings >= PRIORITY_THRESHOLD;
}

// ---- STORE RESET (dev helper) ------------------------------
// Run resetStore() in console to wipe and re-seed everything.
function resetStore() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  initStore();
  console.log('Store reset to seed data.');
}

initStore();