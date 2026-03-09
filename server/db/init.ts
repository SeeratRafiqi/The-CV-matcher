import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);

const AUTO_CREATE_DB = process.env.AUTO_CREATE_DB !== 'false';
const AUTO_MIGRATE = process.env.AUTO_MIGRATE !== 'false';
const AUTO_SEED = process.env.AUTO_SEED === 'true';

export async function initializeDatabase() {
  if (process.env.SKIP_SETUP === 'true') {
    console.log('⏭️  Database setup skipped (SKIP_SETUP=true)');
    return;
  }

  try {
    // Create database if enabled (MySQL only; skip for SQLite)
    const useSqlite = process.env.USE_SQLITE !== 'false' && !process.env.DATABASE_URL && !process.env.DB_HOST;
    if (AUTO_CREATE_DB && !useSqlite) {
      try {
        await execAsync('npm run db:create');
        console.log('✅ Database ready');
      } catch (error) {
        console.warn('⚠️  Database creation failed, continuing...');
      }
    }

    // Run migrations if enabled
    if (AUTO_MIGRATE) {
      try {
        await execAsync('npm run db:migrate');
        console.log('✅ Migrations completed');
      } catch (error) {
        console.error('❌ Migration failed');
        throw error;
      }
    }

    // Run seeding if enabled
    if (AUTO_SEED) {
      try {
        await execAsync('npm run db:seed');
        console.log('✅ Seeding completed');
      } catch (error) {
        console.warn('⚠️  Seeding failed, continuing...');
        // Don't throw - seeding failure shouldn't stop server startup
      }
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}
