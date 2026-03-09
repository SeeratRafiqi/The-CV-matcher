# Troubleshooting Guide

## Common Server Issues

### 1. Registration / Login failed: "connect ECONNREFUSED ::1:3306"

**Error:**
```
Registration failed. connect ECONNREFUSED ::1:3306
```
(or similar `ECONNREFUSED` on port 3306)

**Cause:**
The app uses **MySQL** to store users and data. Port 3306 is MySQL’s default port. This error means MySQL is not running (or not installed) on your machine, so the server cannot connect to the database.

**Solutions:**

- **Option A: Install and run MySQL**
  1. Install MySQL (e.g. [MySQL Community Server](https://dev.mysql.com/downloads/mysql/) or [XAMPP](https://www.apachefriends.org/) which includes MySQL).
  2. Start the MySQL service.
  3. Create a database (e.g. `cv_matcher`) and a user with access.
  4. In the project root, create or edit `.env` and set either:
     - `DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/cv_matcher`
     or separate variables:
     - `DB_HOST=localhost`
     - `DB_PORT=3306`
     - `DB_USER=your_user`
     - `DB_PASSWORD=your_password`
     - `DB_NAME=cv_matcher`
  5. Run migrations: `npm run db:migrate` (or use the server’s setup if it runs migrations on start).
  6. Restart the app and try registering again.

- **Option B: Use a cloud MySQL**
  Use a hosted MySQL (e.g. PlanetScale, AWS RDS, or your provider) and set `DATABASE_URL` in `.env` to the connection string they give you.

Until MySQL is running and the app can connect, registration and login will fail with a connection error. The app does not support running without a database for auth.

---

### 2. MySQL Error: "Too many keys specified; max 64 keys allowed"

**Error:**
```
ER_TOO_MANY_KEYS: Too many keys specified; max 64 keys allowed
```

**Cause:**
This happens when the `users` table (or other tables) has accumulated too many indexes, often from repeated migration attempts with `alter: true`.

**Solutions:**

#### Option A: Check and Fix Indexes (Recommended)
```bash
# Check current indexes
npm run db:fix-indexes

# This will show you duplicate indexes and provide SQL commands to remove them
```

#### Option B: Skip Migration (If tables already exist)
```bash
# Set environment variable to skip migrations
export AUTO_MIGRATE=false
# Or in .env file:
AUTO_MIGRATE=false
```

#### Option C: Force Recreate Tables (⚠️ Deletes all data!)
```bash
# Only use in development or if you can lose data
export FORCE_RECREATE_TABLES=true
npm run db:migrate
```

#### Option D: Manual Index Cleanup
Connect to MySQL and check indexes:
```sql
-- Check all indexes on users table
SHOW INDEXES FROM users;

-- Remove duplicate indexes (replace 'index_name' with actual name)
DROP INDEX `index_name` ON `users`;
```

**Prevention:**
The migration script has been updated to avoid this issue by:
- Using `alter: false` by default (safer)
- Catching "too many keys" errors and skipping alter operations
- Only creating tables if they don't exist

---

### 3. Port Already in Use (EADDRINUSE)

**Error:**
```
Error: listen EADDRINUSE: address already in use 127.0.0.1:5000
```

**Cause:**
Another process is already using port 5000, or PM2 is trying to start multiple instances.

**Quick Fix (Recommended):**

```bash
# 1. Stop all PM2 processes
pm2 delete all

# 2. Check and kill any process using port 5000
npm run port:check
# If processes found, kill them:
npm run port:kill

# 3. Verify nothing is using the port
npm run port:check

# 4. Start fresh
npm run pm2:start:dev
```

**Detailed Solutions:**

#### Step 1: Check What's Using Port 5000
```bash
# Use the helper script
npm run port:check

# Or manually (Linux)
sudo lsof -i :5000
# Or
sudo netstat -tulpn | grep 5000

# Find the process ID (PID) and kill it
sudo kill -9 <PID>
```

#### Step 2: Stop Only This App (Safer - Recommended)
```bash
# Check what PM2 processes are running
pm2 list

# Stop only this app (safer - won't affect other apps)
pm2 stop asset-manager-dev
pm2 stop asset-manager

# Delete only this app's processes
pm2 delete asset-manager-dev
pm2 delete asset-manager

# Or delete by ID if you see multiple instances
pm2 delete <id>
```

**⚠️ WARNING:** If you have other apps running on PM2, use the commands above instead of `pm2 delete all` which will stop ALL PM2 processes.

#### Step 2b: Stop All PM2 Processes (Use Only If No Other Apps)
```bash
# ⚠️ ONLY use this if you have NO other apps on PM2
# This will stop ALL PM2 processes on the server

# Stop all PM2 processes
pm2 stop all

# Delete all PM2 processes
pm2 delete all
```

#### Step 3: Check PM2 Status
```bash
# List all PM2 processes
pm2 list

# If you see multiple instances, delete duplicates
pm2 delete <app-name>:<id>
```

#### Step 4: Kill Processes Using Port (Automated)
```bash
# Use the helper script to automatically find and kill
npm run port:kill

# Or manually kill specific PID
sudo kill -9 <PID>
```

#### Step 5: Change Port (Alternative)
If you can't free port 5000, change it in your `.env`:
```env
PORT=3000
```

Then restart:
```bash
pm2 restart asset-manager
```

#### Step 6: Restart Cleanly
```bash
# Make sure no processes are running
pm2 list
npm run port:check

# Start fresh (only ONE of these)
npm run pm2:start:dev    # For development
# OR
npm run pm2:start        # For production

# Don't run both at the same time!
```

---

### 4. Database Connection Issues

**Error:**
```
Database connection failed
```

**Solutions:**

1. **Check Database Credentials:**
   ```bash
   # Verify .env file has correct DATABASE_URL
   cat .env | grep DATABASE_URL
   ```

2. **Test Connection:**
   ```bash
   # Test database connection
   npm run db:verify
   ```

3. **Check Database Server:**
   ```bash
   # Check if MySQL is running
   sudo systemctl status mysql
   # Or
   sudo service mysql status
   ```

4. **Create Database if Missing:**
   ```bash
   npm run db:create
   ```

---

### 5. PM2 App Keeps Restarting

**Symptoms:**
- App shows as "errored" or keeps restarting
- High restart count in `pm2 list`

**Solutions:**

1. **Check Logs:**
   ```bash
   pm2 logs asset-manager --err
   ```

2. **Check Memory:**
   ```bash
   pm2 monit
   # Look for memory usage
   ```

3. **Increase Memory Limit:**
   Edit `ecosystem.config.cjs`:
   ```javascript
   max_memory_restart: '2G', // Increase from 1G
   ```

4. **Check for Errors:**
   ```bash
   # View recent errors
   pm2 logs asset-manager --lines 100 --err
   ```

---

### 6. Migration Fails During Startup

**Error:**
```
Database initialization failed: Error: Command failed: npm run db:migrate
```

**Solutions:**

1. **Skip Auto-Migration:**
   ```bash
   # In .env file
   AUTO_MIGRATE=false
   ```

2. **Run Migration Manually:**
   ```bash
   npm run db:migrate
   ```

3. **Fix Index Issues First:**
   ```bash
   npm run db:fix-indexes
   ```

---

### 7. PM2 Not Starting on Server Reboot

**Solutions:**

1. **Re-run Startup Script:**
   ```bash
   pm2 startup
   # Follow the instructions (usually requires sudo)
   ```

2. **Save PM2 Configuration:**
   ```bash
   pm2 save
   ```

3. **Verify Startup Script:**
   ```bash
   # Check if startup script exists
   pm2 startup
   ```

---

## Quick Fix Commands

```bash
# Stop everything and start fresh
pm2 delete all
pm2 stop all
npm run pm2:start

# Check what's wrong
pm2 logs asset-manager --err
pm2 monit

# Fix database issues
npm run db:fix-indexes
AUTO_MIGRATE=false npm run pm2:start

# Change port if needed
PORT=3000 npm run pm2:start
```

---

## Getting Help

1. **Check Logs:**
   ```bash
   pm2 logs asset-manager --lines 200
   ```

2. **Check PM2 Status:**
   ```bash
   pm2 list
   pm2 show asset-manager
   ```

3. **Check Database:**
   ```bash
   npm run db:verify
   ```

4. **Check Environment:**
   ```bash
   # Verify .env file exists and has correct values
   cat .env
   ```

---

## Prevention Tips

1. **Always use `alter: false` in migrations** (already fixed in code)
2. **Don't run migrations multiple times** without checking table state
3. **Use PM2 properly** - don't start multiple instances manually
4. **Monitor logs regularly** to catch issues early
5. **Backup database** before running migrations in production
