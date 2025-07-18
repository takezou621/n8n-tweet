/**
 * Database Connection Service
 * Manages PostgreSQL connection pool and provides database utilities
 */

const { Pool } = require('pg');
const winston = require('winston');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'database' }
    });
    this.setupConnection();
  }

  setupConnection() {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'n8n',
      user: process.env.DB_USER || 'n8n',
      password: process.env.DB_PASSWORD || 'n8n_secure_password',
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
    };

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      this.logger.error('Database pool error:', err);
    });

    // Handle client connection
    this.pool.on('connect', (client) => {
      this.logger.debug('New client connected to database');
    });

    // Handle client removal
    this.pool.on('remove', (client) => {
      this.logger.debug('Client removed from database pool');
    });
  }

  async query(text, params = []) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      this.logger.debug('Query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error('Query failed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        error: error.message
      });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async transaction(callback) {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async testConnection() {
    try {
      const result = await this.query('SELECT NOW() as current_time, version() as version');
      this.logger.info('Database connection test successful', {
        time: result.rows[0].current_time,
        version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
      });
      return true;
    } catch (error) {
      this.logger.error('Database connection test failed:', error.message);
      return false;
    }
  }

  async getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.logger.info('Database pool closed');
    }
  }

  // Utility methods for common operations
  async exists(table, condition, params = []) {
    const query = `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${condition})`;
    const result = await this.query(query, params);
    return result.rows[0].exists;
  }

  async count(table, condition = '1=1', params = []) {
    const query = `SELECT COUNT(*) FROM ${table} WHERE ${condition}`;
    const result = await this.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async findById(table, id, idColumn = 'id') {
    const query = `SELECT * FROM ${table} WHERE ${idColumn} = $1`;
    const result = await this.query(query, [id]);
    return result.rows[0] || null;
  }

  async findMany(table, condition = '1=1', params = [], orderBy = 'id', limit = null, offset = null) {
    let query = `SELECT * FROM ${table} WHERE ${condition} ORDER BY ${orderBy}`;
    
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    
    if (offset) {
      query += ` OFFSET ${offset}`;
    }
    
    const result = await this.query(query, params);
    return result.rows;
  }

  async insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${keys.join(', ')}) 
      VALUES (${placeholders}) 
      RETURNING *
    `;
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  async update(table, id, data, idColumn = 'id') {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    
    const query = `
      UPDATE ${table} 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE ${idColumn} = $1 
      RETURNING *
    `;
    
    const result = await this.query(query, [id, ...values]);
    return result.rows[0];
  }

  async delete(table, id, idColumn = 'id') {
    const query = `DELETE FROM ${table} WHERE ${idColumn} = $1 RETURNING *`;
    const result = await this.query(query, [id]);
    return result.rows[0];
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

// Export both the class and the singleton instance
module.exports = {
  DatabaseService,
  database: databaseService
};