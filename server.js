/**
 * TrashDash — Server Entry Point
 * Connects to Aiven MySQL, creates tables, seeds data, then starts HTTP server.
 */

require('dotenv').config();
const app = require('./app');

const { pool, testConnection, createTables, seedData } = require('./src/config/database');
const PORT = process.env.PORT || 3000;

async function start() {
  console.log('\n    TrashDash — Starting...');
  console.log(`    Database: ${process.env.DB_HOST}:${process.env.DB_PORT}`);

  await testConnection();   // Will exit(1) if it fails
  
//  await pool.execute('DROP TABLE IF EXISTS users, bookings, workers');
  
  await createTables();     // CREATE TABLE IF NOT EXISTS
  await seedData();         // Insert seed data only if tables are empty

  app.listen(PORT, () => {
    console.log('');
    console.log('    TrashDash API running!');
    console.log(`    http://localhost:${PORT}`);
    console.log('  ─────────────────────────────────────');
    console.log('  POST  /api/auth/login');
    console.log('  POST  /api/auth/register');
    console.log('  GET   /api/bookings');
    console.log('  GET   /api/bookings/stats');
    console.log('  GET   /api/workers');
    console.log('  GET   /api/users');
    console.log('  GET   /api/health');
    console.log('  ─────────────────────────────────────\n');
  });
}

start().catch(err => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
