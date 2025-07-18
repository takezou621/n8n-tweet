#!/usr/bin/env node

/**
 * Database Migration Runner for Intelligent Content Dashboard
 * Executes SQL migration files against the PostgreSQL database
 */

const fs = require('fs').promises;
const path = require('path');
const { Client } = require('pg');

// Database configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'n8n',
  user: process.env.DB_USER || 'n8n',
  password: process.env.DB_PASSWORD || 'n8n_secure_password'
};

class MigrationRunner {
  constructor() {
    this.client = new Client(DB_CONFIG);
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to database successfully');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async disconnect() {
    await this.client.end();
    console.log('✅ Disconnected from database');
  }

  async createMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
      );
    `;
    
    try {
      await this.client.query(createTableSQL);
      console.log('✅ Migrations table ready');
    } catch (error) {
      console.error('❌ Failed to create migrations table:', error.message);
      throw error;
    }
  }

  async getExecutedMigrations() {
    try {
      const result = await this.client.query(
        'SELECT filename FROM migrations ORDER BY id'
      );
      return result.rows.map(row => row.filename);
    } catch (error) {
      console.error('❌ Failed to get executed migrations:', error.message);
      throw error;
    }
  }

  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      console.error('❌ Failed to read migrations directory:', error.message);
      throw error;
    }
  }

  async calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async executeMigration(filename) {
    const filePath = path.join(this.migrationsDir, filename);
    
    try {
      console.log(`🔄 Executing migration: ${filename}`);
      
      const content = await fs.readFile(filePath, 'utf8');
      const checksum = await this.calculateChecksum(content);
      
      // Begin transaction
      await this.client.query('BEGIN');
      
      try {
        // Execute migration SQL
        await this.client.query(content);
        
        // Record migration execution
        await this.client.query(
          'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum]
        );
        
        // Commit transaction
        await this.client.query('COMMIT');
        console.log(`✅ Migration executed successfully: ${filename}`);
        
      } catch (error) {
        // Rollback on error
        await this.client.query('ROLLBACK');
        throw error;
      }
      
    } catch (error) {
      console.error(`❌ Failed to execute migration ${filename}:`, error.message);
      throw error;
    }
  }

  async runMigrations() {
    try {
      await this.connect();
      await this.createMigrationsTable();
      
      const executed = await this.getExecutedMigrations();
      const available = await this.getMigrationFiles();
      
      const pending = available.filter(file => !executed.includes(file));
      
      if (pending.length === 0) {
        console.log('✅ No pending migrations');
        return;
      }
      
      console.log(`📋 Found ${pending.length} pending migration(s):`);
      pending.forEach(file => console.log(`  - ${file}`));
      
      for (const migration of pending) {
        await this.executeMigration(migration);
      }
      
      console.log('🎉 All migrations completed successfully!');
      
    } catch (error) {
      console.error('💥 Migration failed:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  async rollback(steps = 1) {
    try {
      await this.connect();
      
      const result = await this.client.query(
        'SELECT filename FROM migrations ORDER BY id DESC LIMIT $1',
        [steps]
      );
      
      if (result.rows.length === 0) {
        console.log('✅ No migrations to rollback');
        return;
      }
      
      console.log(`⚠️  Rolling back ${result.rows.length} migration(s):`);
      result.rows.forEach(row => console.log(`  - ${row.filename}`));
      
      // For now, just remove from migrations table
      // In a production system, you'd want proper rollback scripts
      for (const row of result.rows) {
        await this.client.query(
          'DELETE FROM migrations WHERE filename = $1',
          [row.filename]
        );
        console.log(`✅ Rolled back: ${row.filename}`);
      }
      
    } catch (error) {
      console.error('💥 Rollback failed:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  async status() {
    try {
      await this.connect();
      await this.createMigrationsTable();
      
      const executed = await this.getExecutedMigrations();
      const available = await this.getMigrationFiles();
      const pending = available.filter(file => !executed.includes(file));
      
      console.log('📊 Migration Status:');
      console.log(`  Total migrations: ${available.length}`);
      console.log(`  Executed: ${executed.length}`);
      console.log(`  Pending: ${pending.length}`);
      
      if (executed.length > 0) {
        console.log('\n✅ Executed migrations:');
        executed.forEach(file => console.log(`  - ${file}`));
      }
      
      if (pending.length > 0) {
        console.log('\n⏳ Pending migrations:');
        pending.forEach(file => console.log(`  - ${file}`));
      }
      
    } catch (error) {
      console.error('💥 Failed to get status:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2] || 'run';
  const runner = new MigrationRunner();
  
  switch (command) {
    case 'run':
      await runner.runMigrations();
      break;
    case 'status':
      await runner.status();
      break;
    case 'rollback':
      const steps = parseInt(process.argv[3]) || 1;
      await runner.rollback(steps);
      break;
    default:
      console.log('Usage:');
      console.log('  node run-migrations.js run      # Run pending migrations');
      console.log('  node run-migrations.js status   # Show migration status');
      console.log('  node run-migrations.js rollback [steps] # Rollback migrations');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = MigrationRunner;