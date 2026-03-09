import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Custom logger that filters out routine queries
const customLogger = (msg: string) => {
  // Only log important queries, not routine SELECTs
  const shouldLog = 
    // Log errors
    msg.toLowerCase().includes('error') ||
    // Log CREATE/ALTER/DROP (schema changes)
    /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)/i.test(msg) ||
    // Log transactions
    /^\s*(START|COMMIT|ROLLBACK)/i.test(msg) ||
    // Log if DB_VERBOSE is enabled
    process.env.DB_VERBOSE === 'true';
  
  if (shouldLog) {
    // Truncate very long queries
    const truncatedMsg = msg.length > 500 ? msg.substring(0, 500) + '...' : msg;
    console.log(`[DB] ${truncatedMsg}`);
  }
};

// Determine logging level
const getLogging = () => {
  // If DB_VERBOSE is explicitly set, use it
  if (process.env.DB_VERBOSE === 'true') {
    return console.log; // Full logging
  }
  if (process.env.DB_VERBOSE === 'false') {
    return false; // No logging
  }
  // Default: use custom logger in development, no logging in production
  return process.env.NODE_ENV === 'development' ? customLogger : false;
};

// Use SQLite when no MySQL is configured (no DATABASE_URL and USE_SQLITE not explicitly false)
const useSqlite =
  process.env.USE_SQLITE !== 'false' &&
  !process.env.DATABASE_URL &&
  !process.env.DB_HOST;

// Parse DATABASE_URL or use individual env vars
let sequelize: Sequelize;

// Connection pool configuration (MySQL only; SQLite ignores pool)
const poolConfig = {
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
  acquire: 30000,
  evict: 1000,
};

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: getLogging(),
    pool: poolConfig,
  });
} else if (useSqlite) {
  const dataDir = path.resolve(process.cwd(), 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (_) {}
  const storage = path.join(dataDir, 'cv_matcher.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage,
    logging: getLogging(),
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'cv_matcher',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      dialect: 'mysql',
      logging: getLogging(),
      pool: poolConfig,
    }
  );
}

export default sequelize;
