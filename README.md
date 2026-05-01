# TrashDash — Cloud Backend (Aiven MySQL)

## What Changed From v1
- ❌ No more JSON files on disk
- ❌ No more localStorage  
- ✅ Real MySQL database hosted on **Aiven Cloud**
- ✅ Passwords saved **exactly as you type them** (plain text in DB)
- ✅ All data persists permanently in the cloud

---

## Step 1 — Create Your Aiven MySQL Database (Free)

1. Go to **https://console.aiven.io** → Sign up (free trial)
2. Click **"+ Create Service"**
3. Choose **MySQL**
4. Choose the free/hobbyist tier
5. Pick any region (closest to Pakistan: Google Cloud `asia-south1`)
6. Click **"Create Service"** — takes ~2 minutes

---

## Step 2 — Get Your Connection Credentials

1. Click your new MySQL service
2. Go to **"Connection Information"** tab
3. You will see:

```
DB_HOST=your-service-name.aivencloud.com
DB_PORT=12345
DB_USER=avnadmin
DB_PASSWORD=YOUR_PASSWORD_HERE
DB_NAME=defaultdb
```

---

## Step 3 — Create Your .env File

In the `trashdash-cloud` folder, create a file called **`.env`** (copy from `.env.example`):

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=trashdash-rawalpindi-2026-change-this

DB_HOST=your-service-name.aivencloud.com
DB_PORT=12345
DB_USER=avnadmin
DB_PASSWORD=AVNS_your-password-here
DB_NAME=defaultdb
DB_SSL=true

FRONTEND_ORIGIN=http://localhost:5500
```

> ⚠️ Replace the DB_ values with YOUR actual Aiven credentials.

---

## Step 4 — Install & Run

```bash
cd trashdash-cloud
npm install
npm start
```

On first run you will see:
```
✅  Aiven MySQL connected: your-service.aivencloud.com
✅  Database tables ready
🌱  Seeding initial data...
✅  Seed data inserted
🚀  http://localhost:3000
```

---

## Step 5 — Connect Your Frontend

Put all your HTML/CSS/JS files in the **`public/`** folder inside `trashdash-cloud`.

Your final folder structure:
```
trashdash-cloud/
├── public/
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── admin.html
│   ├── worker.html
│   ├── style.css
│   ├── admin-style.css
│   ├── admin-app.js
│   ├── resident-app.js
│   └── api-bridge.js      ← already here
├── server.js
├── app.js
├── .env                   ← YOU CREATE THIS
├── .env.example
└── src/...
```

Then open: **http://localhost:3000/login.html**

---

## Demo Credentials (stored in Aiven DB)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@waste.pk | admin123 |
| Resident | ahmed@example.com | password123 |
| Resident | sara@example.com | password123 |

> Passwords are stored exactly as shown above in the MySQL database — no hashing.

---

## API Endpoints

```
POST  /api/auth/login       → Login
POST  /api/auth/register    → Register
GET   /api/auth/me          → Get current user

GET   /api/bookings         → List bookings
POST  /api/bookings         → Create booking  
PATCH /api/bookings/:id/status → Update status
POST  /api/bookings/:id/assign → Assign worker
GET   /api/bookings/stats   → Dashboard stats

GET   /api/users            → List users (admin)
POST  /api/users            → Add user (admin)
PUT   /api/users/:id        → Update user

GET   /api/workers          → List workers
POST  /api/workers          → Add worker (admin)
PUT   /api/workers/:id      → Update worker

GET   /api/health           → Health check
```
