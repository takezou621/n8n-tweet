/**
 * TweetTemplate Model
 * Manages tweet generation templates
 */

const { database } = require('../services/database');
const { createNotFoundError, createValidationError } = require('../middleware/error-handler');

class TweetTemplate {
  constructor(data = {}) {
    this.id = data.id;
    this.name = data.name;
    this.template = data.template;
    this.category = data.category;
    this.variables = data.variables || [];
    this.maxLength = data.max_length || data.maxLength || 280;
    this.isActive = data.is_active !== undefined ? data.is_active : data.isActive !== undefined ? data.isActive : true;
    this.usageCount = data.usage_count || data.usageCount || 0;
    this.successRate = data.success_rate || data.successRate || 0.0;
    this.description = data.description;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.createdBy = data.created_by || data.createdBy;
  }

  // Validation
  validate() {
    const errors = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Template name is required' });
    }

    if (this.name && this.name.length > 255) {
      errors.push({ field: 'name', message: 'Template name cannot exceed 255 characters' });
    }

    if (!this.template || this.template.trim().length === 0) {
      errors.push({ field: 'template', message: 'Template content is required' });
    }

    if (!this.category || this.category.trim().length === 0) {
      errors.push({ field: 'category', message: 'Category is required' });
    }

    if (this.category && this.category.length > 100) {
      errors.push({ field: 'category', message: 'Category cannot exceed 100 characters' });
    }

    if (this.maxLength && (this.maxLength < 1 || this.maxLength > 500)) {
      errors.push({ field: 'maxLength', message: 'Max length must be between 1 and 500' });
    }

    if (this.successRate && (this.successRate < 0 || this.successRate > 100)) {
      errors.push({ field: 'successRate', message: 'Success rate must be between 0 and 100' });
    }

    // Validate variables format
    if (this.variables && !Array.isArray(this.variables)) {
      errors.push({ field: 'variables', message: 'Variables must be an array' });
    }

    if (errors.length > 0) {
      throw createValidationError('Tweet template validation failed', errors);
    }
  }

  // Extract variables from template
  extractVariables() {
    const variableRegex = /\{(\w+)\}/g;
    const variables = [];
    let match;

    while ((match = variableRegex.exec(this.template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    this.variables = variables;
    return variables;
  }

  // Convert to database format
  toDbFormat() {
    return {
      name: this.name?.trim(),
      template: this.template?.trim(),
      category: this.category?.trim(),
      variables: this.variables,
      max_length: this.maxLength,
      is_active: this.isActive,
      usage_count: this.usageCount,
      success_rate: this.successRate,
      description: this.description?.trim() || null,
      created_by: this.createdBy
    };
  }

  // Static methods for database operations
  static async create(data) {
    const template = new TweetTemplate(data);
    template.extractVariables();
    template.validate();

    const dbData = template.toDbFormat();
    const result = await database.insert('tweet_templates', dbData);
    return new TweetTemplate(result);
  }

  static async findById(id) {
    const result = await database.findById('tweet_templates', id);
    if (!result) {
      throw createNotFoundError(`Tweet template with id ${id} not found`);
    }
    return new TweetTemplate(result);
  }

  static async findByName(name) {
    const query = 'SELECT * FROM tweet_templates WHERE name = $1';
    const result = await database.query(query, [name]);
    if (result.rows.length === 0) {
      return null;
    }
    return new TweetTemplate(result.rows[0]);
  }

  static async findByCategory(category, activeOnly = true) {
    let whereClause = 'category = $1';
    const params = [category];

    if (activeOnly) {
      whereClause += ' AND is_active = true';
    }

    const result = await database.findMany(
      'tweet_templates',
      whereClause,
      params,
      'success_rate DESC, usage_count DESC'
    );

    return result.map(row => new TweetTemplate(row));
  }

  static async findActive() {
    const result = await database.findMany(
      'tweet_templates',
      'is_active = true',
      [],
      'success_rate DESC, usage_count DESC'
    );

    return result.map(row => new TweetTemplate(row));
  }

  static async findAll(filters = {}) {
    let whereClause = '1=1';
    let params = [];
    let paramIndex = 1;

    // Add category filter
    if (filters.category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    // Add active filter
    if (filters.isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex}`;
      params.push(filters.isActive);
      paramIndex++;
    }

    // Add search filter
    if (filters.search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR template ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const orderBy = filters.sortBy === 'usage' ? 'usage_count DESC' : 
                   filters.sortBy === 'success' ? 'success_rate DESC' : 
                   'name ASC';

    const result = await database.findMany(
      'tweet_templates',
      whereClause,
      params,
      orderBy
    );

    return result.map(row => new TweetTemplate(row));
  }

  static async getCategories() {
    const query = 'SELECT DISTINCT category FROM tweet_templates ORDER BY category';
    const result = await database.query(query);
    return result.rows.map(row => row.category);
  }

  static async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_active THEN 1 END) as active,
        COUNT(DISTINCT category) as categories,
        AVG(usage_count) as avg_usage,
        AVG(success_rate) as avg_success_rate,
        MAX(usage_count) as max_usage
      FROM tweet_templates
    `;
    const result = await database.query(query);
    const stats = result.rows[0];

    return {
      total: parseInt(stats.total),
      active: parseInt(stats.active),
      categories: parseInt(stats.categories),
      avgUsage: parseFloat(stats.avg_usage) || 0,
      avgSuccessRate: parseFloat(stats.avg_success_rate) || 0,
      maxUsage: parseInt(stats.max_usage) || 0
    };
  }

  static async getBestPerforming(limit = 5) {
    const result = await database.findMany(
      'tweet_templates',
      'is_active = true AND usage_count > 0',
      [],
      'success_rate DESC, usage_count DESC',
      limit
    );

    return result.map(row => new TweetTemplate(row));
  }

  // Generate tweet from template
  generateTweet(data) {
    let tweet = this.template;
    
    // Replace variables
    this.variables.forEach(variable => {
      const value = data[variable] || '';
      const placeholder = `{${variable}}`;
      tweet = tweet.replace(new RegExp(placeholder, 'g'), value);
    });

    // Clean up extra spaces
    tweet = tweet.replace(/\s+/g, ' ').trim();

    // Check length and truncate if necessary
    if (tweet.length > this.maxLength) {
      tweet = tweet.substring(0, this.maxLength - 3) + '...';
    }

    return tweet;
  }

  // Preview template with sample data
  preview(sampleData = {}) {
    const defaultData = {
      title: 'Sample AI Research Title',
      url: 'https://example.com/article',
      hashtags: '#AI #MachineLearning',
      source: 'AI Research Blog',
      author: 'Dr. AI Researcher'
    };

    const data = { ...defaultData, ...sampleData };
    return this.generateTweet(data);
  }

  // Instance methods
  async save() {
    this.extractVariables();
    this.validate();

    if (this.id) {
      const dbData = this.toDbFormat();
      const result = await database.update('tweet_templates', this.id, dbData);
      Object.assign(this, new TweetTemplate(result));
    } else {
      const result = await TweetTemplate.create(this.toDbFormat());
      Object.assign(this, result);
    }

    return this;
  }

  async delete() {
    if (!this.id) {
      throw createValidationError('Cannot delete tweet template without id');
    }
    return await database.delete('tweet_templates', this.id);
  }

  async activate() {
    this.isActive = true;
    return await this.save();
  }

  async deactivate() {
    this.isActive = false;
    return await this.save();
  }

  async incrementUsage() {
    this.usageCount += 1;
    const dbData = { usage_count: this.usageCount };
    await database.update('tweet_templates', this.id, dbData);
    return this;
  }

  async updateSuccessRate(successful) {
    // Simple success rate calculation based on recent performance
    const weight = 0.1; // How much new data affects the rate
    if (successful) {
      this.successRate = this.successRate + (100 - this.successRate) * weight;
    } else {
      this.successRate = this.successRate * (1 - weight);
    }
    
    this.successRate = Math.round(this.successRate * 100) / 100;
    
    const dbData = { success_rate: this.successRate };
    await database.update('tweet_templates', this.id, dbData);
    return this;
  }

  // Check if template name exists (case-insensitive)
  static async nameExists(name, excludeId = null) {
    let query = 'SELECT COUNT(*) FROM tweet_templates WHERE LOWER(name) = LOWER($1)';
    let params = [name];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await database.query(query, params);
    return parseInt(result.rows[0].count) > 0;
  }

  // Validate template against content
  validateWithContent(content) {
    const tweet = this.generateTweet(content);
    const issues = [];

    if (tweet.length > this.maxLength) {
      issues.push(`Generated tweet exceeds max length (${tweet.length}/${this.maxLength})`);
    }

    // Check for unresolved variables
    const unresolvedVars = tweet.match(/\{\w+\}/g);
    if (unresolvedVars) {
      issues.push(`Unresolved variables: ${unresolvedVars.join(', ')}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      generatedTweet: tweet,
      length: tweet.length
    };
  }

  // Format for display
  toDisplayFormat() {
    return {
      id: this.id,
      name: this.name,
      template: this.template,
      category: this.category,
      variables: this.variables,
      maxLength: this.maxLength,
      isActive: this.isActive,
      usageCount: this.usageCount,
      successRate: this.successRate,
      description: this.description,
      preview: this.preview(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = TweetTemplate;