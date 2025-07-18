/**
 * KeywordFilter Model
 * Manages keyword filtering configuration
 */

const { database } = require('../services/database');
const { createNotFoundError, createValidationError } = require('../middleware/error-handler');

class KeywordFilter {
  constructor(data = {}) {
    this.id = data.id;
    this.keyword = data.keyword;
    this.category = data.category;
    this.priority = data.priority || 1;
    this.weight = data.weight || 1.0;
    this.isActive = data.is_active !== undefined ? data.is_active : data.isActive !== undefined ? data.isActive : true;
    this.isExclude = data.is_exclude !== undefined ? data.is_exclude : data.isExclude !== undefined ? data.isExclude : false;
    this.description = data.description;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.createdBy = data.created_by || data.createdBy;
  }

  // Validation
  validate() {
    const errors = [];

    if (!this.keyword || this.keyword.trim().length === 0) {
      errors.push({ field: 'keyword', message: 'Keyword is required' });
    }

    if (this.keyword && this.keyword.length > 255) {
      errors.push({ field: 'keyword', message: 'Keyword cannot exceed 255 characters' });
    }

    if (!this.category || this.category.trim().length === 0) {
      errors.push({ field: 'category', message: 'Category is required' });
    }

    if (this.category && this.category.length > 100) {
      errors.push({ field: 'category', message: 'Category cannot exceed 100 characters' });
    }

    if (this.priority && (this.priority < 1 || this.priority > 5)) {
      errors.push({ field: 'priority', message: 'Priority must be between 1 and 5' });
    }

    if (this.weight && (this.weight < 0 || this.weight > 5)) {
      errors.push({ field: 'weight', message: 'Weight must be between 0 and 5' });
    }

    if (errors.length > 0) {
      throw createValidationError('Keyword filter validation failed', errors);
    }
  }

  // Convert to database format
  toDbFormat() {
    return {
      keyword: this.keyword?.trim(),
      category: this.category?.trim(),
      priority: this.priority,
      weight: this.weight,
      is_active: this.isActive,
      is_exclude: this.isExclude,
      description: this.description?.trim() || null,
      created_by: this.createdBy
    };
  }

  // Static methods for database operations
  static async create(data) {
    const filter = new KeywordFilter(data);
    filter.validate();

    const dbData = filter.toDbFormat();
    const result = await database.insert('keyword_filters', dbData);
    return new KeywordFilter(result);
  }

  static async findById(id) {
    const result = await database.findById('keyword_filters', id);
    if (!result) {
      throw createNotFoundError(`Keyword filter with id ${id} not found`);
    }
    return new KeywordFilter(result);
  }

  static async findByKeyword(keyword) {
    const query = 'SELECT * FROM keyword_filters WHERE keyword = $1';
    const result = await database.query(query, [keyword]);
    if (result.rows.length === 0) {
      return null;
    }
    return new KeywordFilter(result.rows[0]);
  }

  static async findByCategory(category, activeOnly = true) {
    let whereClause = 'category = $1';
    const params = [category];

    if (activeOnly) {
      whereClause += ' AND is_active = true';
    }

    const result = await database.findMany(
      'keyword_filters',
      whereClause,
      params,
      'priority DESC, weight DESC'
    );

    return result.map(row => new KeywordFilter(row));
  }

  static async findActive() {
    const result = await database.findMany(
      'keyword_filters',
      'is_active = true',
      [],
      'priority DESC, weight DESC'
    );

    return result.map(row => new KeywordFilter(row));
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

    // Add exclude filter
    if (filters.isExclude !== undefined) {
      whereClause += ` AND is_exclude = $${paramIndex}`;
      params.push(filters.isExclude);
      paramIndex++;
    }

    // Add priority filter
    if (filters.minPriority) {
      whereClause += ` AND priority >= $${paramIndex}`;
      params.push(filters.minPriority);
      paramIndex++;
    }

    // Add search filter
    if (filters.search) {
      whereClause += ` AND (keyword ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const result = await database.findMany(
      'keyword_filters',
      whereClause,
      params,
      'priority DESC, weight DESC, keyword ASC'
    );

    return result.map(row => new KeywordFilter(row));
  }

  static async getCategories() {
    const query = 'SELECT DISTINCT category FROM keyword_filters ORDER BY category';
    const result = await database.query(query);
    return result.rows.map(row => row.category);
  }

  static async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_active THEN 1 END) as active,
        COUNT(CASE WHEN is_exclude THEN 1 END) as exclude_filters,
        COUNT(DISTINCT category) as categories,
        AVG(priority) as avg_priority,
        AVG(weight) as avg_weight
      FROM keyword_filters
    `;
    const result = await database.query(query);
    const stats = result.rows[0];

    return {
      total: parseInt(stats.total),
      active: parseInt(stats.active),
      excludeFilters: parseInt(stats.exclude_filters),
      categories: parseInt(stats.categories),
      avgPriority: parseFloat(stats.avg_priority) || 0,
      avgWeight: parseFloat(stats.avg_weight) || 0
    };
  }

  // Calculate content relevance score
  static async calculateRelevanceScore(content) {
    const activeFilters = await KeywordFilter.findActive();
    let totalScore = 0;
    let totalWeight = 0;
    const matchedKeywords = [];

    const contentText = `${content.title || ''} ${content.description || ''}`.toLowerCase();

    for (const filter of activeFilters) {
      const keyword = filter.keyword.toLowerCase();
      
      if (contentText.includes(keyword)) {
        if (filter.isExclude) {
          // Exclude filter matched - return very low score
          return {
            score: 0.1,
            matchedKeywords: [keyword],
            excluded: true
          };
        } else {
          // Include filter matched
          const score = filter.priority * filter.weight;
          totalScore += score;
          totalWeight += filter.weight;
          matchedKeywords.push({
            keyword,
            category: filter.category,
            priority: filter.priority,
            weight: filter.weight,
            score
          });
        }
      }
    }

    // Normalize score to 0-5 range
    const normalizedScore = totalWeight > 0 ? Math.min(5, totalScore / totalWeight) : 0;

    return {
      score: parseFloat(normalizedScore.toFixed(2)),
      matchedKeywords,
      excluded: false
    };
  }

  // Instance methods
  async save() {
    this.validate();

    if (this.id) {
      const dbData = this.toDbFormat();
      const result = await database.update('keyword_filters', this.id, dbData);
      Object.assign(this, new KeywordFilter(result));
    } else {
      const result = await KeywordFilter.create(this.toDbFormat());
      Object.assign(this, result);
    }

    return this;
  }

  async delete() {
    if (!this.id) {
      throw createValidationError('Cannot delete keyword filter without id');
    }
    return await database.delete('keyword_filters', this.id);
  }

  async activate() {
    this.isActive = true;
    return await this.save();
  }

  async deactivate() {
    this.isActive = false;
    return await this.save();
  }

  async toggleActive() {
    this.isActive = !this.isActive;
    return await this.save();
  }

  // Check if keyword exists (case-insensitive)
  static async keywordExists(keyword, excludeId = null) {
    let query = 'SELECT COUNT(*) FROM keyword_filters WHERE LOWER(keyword) = LOWER($1)';
    let params = [keyword];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await database.query(query, params);
    return parseInt(result.rows[0].count) > 0;
  }

  // Get weighted score for content
  getWeightedScore() {
    return this.priority * this.weight;
  }

  // Format for display
  toDisplayFormat() {
    return {
      id: this.id,
      keyword: this.keyword,
      category: this.category,
      priority: this.priority,
      weight: this.weight,
      isActive: this.isActive,
      isExclude: this.isExclude,
      description: this.description,
      weightedScore: this.getWeightedScore(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = KeywordFilter;