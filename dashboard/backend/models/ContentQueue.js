/**
 * ContentQueue Model
 * Manages content queue operations for tweet approval workflow
 */

const { database } = require('../services/database');
const { createNotFoundError, createValidationError } = require('../middleware/error-handler');

class ContentQueue {
  constructor(data = {}) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.url = data.url;
    this.sourceFeed = data.source_feed || data.sourceFeed;
    this.category = data.category;
    this.relevanceScore = data.relevance_score || data.relevanceScore || 0.0;
    this.generatedTweet = data.generated_tweet || data.generatedTweet;
    this.hashtags = data.hashtags || [];
    this.status = data.status || 'pending';
    this.rejectionReason = data.rejection_reason || data.rejectionReason;
    this.editedTweet = data.edited_tweet || data.editedTweet;
    this.originalTweet = data.original_tweet || data.originalTweet;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.approvedAt = data.approved_at || data.approvedAt;
    this.approvedBy = data.approved_by || data.approvedBy;
    this.scheduledFor = data.scheduled_for || data.scheduledFor;
    this.postedAt = data.posted_at || data.postedAt;
    this.tweetId = data.tweet_id || data.tweetId;
  }

  // Validation
  validate() {
    const errors = [];

    if (!this.title || this.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required' });
    }

    if (!this.sourceFeed || this.sourceFeed.trim().length === 0) {
      errors.push({ field: 'sourceFeed', message: 'Source feed is required' });
    }

    if (!this.category || this.category.trim().length === 0) {
      errors.push({ field: 'category', message: 'Category is required' });
    }

    if (!this.generatedTweet || this.generatedTweet.trim().length === 0) {
      errors.push({ field: 'generatedTweet', message: 'Generated tweet is required' });
    }

    if (this.generatedTweet && this.generatedTweet.length > 280) {
      errors.push({ field: 'generatedTweet', message: 'Generated tweet cannot exceed 280 characters' });
    }

    if (this.editedTweet && this.editedTweet.length > 280) {
      errors.push({ field: 'editedTweet', message: 'Edited tweet cannot exceed 280 characters' });
    }

    const validStatuses = ['pending', 'approved', 'rejected', 'posted'];
    if (this.status && !validStatuses.includes(this.status)) {
      errors.push({ field: 'status', message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    if (this.relevanceScore && (this.relevanceScore < 0 || this.relevanceScore > 5)) {
      errors.push({ field: 'relevanceScore', message: 'Relevance score must be between 0 and 5' });
    }

    if (errors.length > 0) {
      throw createValidationError('Content queue validation failed', errors);
    }
  }

  // Convert to database format
  toDbFormat() {
    return {
      title: this.title,
      description: this.description,
      url: this.url,
      source_feed: this.sourceFeed,
      category: this.category,
      relevance_score: this.relevanceScore,
      generated_tweet: this.generatedTweet,
      hashtags: this.hashtags,
      status: this.status,
      rejection_reason: this.rejectionReason,
      edited_tweet: this.editedTweet,
      original_tweet: this.originalTweet,
      approved_by: this.approvedBy,
      scheduled_for: this.scheduledFor,
      tweet_id: this.tweetId
    };
  }

  // Static methods for database operations
  static async create(data) {
    const contentQueue = new ContentQueue(data);
    contentQueue.validate();

    const dbData = contentQueue.toDbFormat();
    const result = await database.insert('content_queue', dbData);
    return new ContentQueue(result);
  }

  static async findById(id) {
    const result = await database.findById('content_queue', id);
    if (!result) {
      throw createNotFoundError(`Content queue item with id ${id} not found`);
    }
    return new ContentQueue(result);
  }

  static async findByStatus(status, limit = 50, offset = 0) {
    const result = await database.findMany(
      'content_queue',
      'status = $1',
      [status],
      'created_at DESC',
      limit,
      offset
    );
    return result.map(row => new ContentQueue(row));
  }

  static async findPending(filters = {}, limit = 50, offset = 0) {
    let whereClause = "status = 'pending'";
    let params = [];
    let paramIndex = 1;

    // Add date range filter
    if (filters.dateFrom) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(filters.dateTo);
      paramIndex++;
    }

    // Add relevance score filter
    if (filters.minRelevanceScore) {
      whereClause += ` AND relevance_score >= $${paramIndex}`;
      params.push(filters.minRelevanceScore);
      paramIndex++;
    }

    // Add category filter
    if (filters.category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    // Add source feed filter
    if (filters.sourceFeed) {
      whereClause += ` AND source_feed = $${paramIndex}`;
      params.push(filters.sourceFeed);
      paramIndex++;
    }

    const result = await database.findMany(
      'content_queue',
      whereClause,
      params,
      'relevance_score DESC, created_at DESC',
      limit,
      offset
    );

    return result.map(row => new ContentQueue(row));
  }

  static async countByStatus(status) {
    return await database.count('content_queue', 'status = $1', [status]);
  }

  static async getStatusCounts() {
    const query = `
      SELECT status, COUNT(*) as count 
      FROM content_queue 
      GROUP BY status
    `;
    const result = await database.query(query);
    
    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      posted: 0
    };

    result.rows.forEach(row => {
      counts[row.status] = parseInt(row.count);
    });

    return counts;
  }

  // Instance methods
  async save() {
    this.validate();

    if (this.id) {
      const dbData = this.toDbFormat();
      const result = await database.update('content_queue', this.id, dbData);
      Object.assign(this, new ContentQueue(result));
    } else {
      const result = await ContentQueue.create(this.toDbFormat());
      Object.assign(this, result);
    }

    return this;
  }

  async approve(userId) {
    this.status = 'approved';
    this.approvedBy = userId;
    this.approvedAt = new Date();
    return await this.save();
  }

  async reject(reason, userId) {
    this.status = 'rejected';
    this.rejectionReason = reason;
    this.approvedBy = userId;
    return await this.save();
  }

  async edit(newTweetContent) {
    if (!this.originalTweet) {
      this.originalTweet = this.generatedTweet;
    }
    this.editedTweet = newTweetContent;
    this.generatedTweet = newTweetContent;
    return await this.save();
  }

  async markAsPosted(tweetId) {
    this.status = 'posted';
    this.tweetId = tweetId;
    this.postedAt = new Date();
    return await this.save();
  }

  async delete() {
    if (!this.id) {
      throw createValidationError('Cannot delete content queue item without id');
    }
    return await database.delete('content_queue', this.id);
  }

  // Get final tweet content (edited or generated)
  getFinalTweet() {
    return this.editedTweet || this.generatedTweet;
  }

  // Check if content has been modified
  isModified() {
    return !!this.editedTweet;
  }

  // Get age in hours
  getAgeInHours() {
    if (!this.createdAt) return 0;
    const now = new Date();
    const created = new Date(this.createdAt);
    return Math.floor((now - created) / (1000 * 60 * 60));
  }
}

module.exports = ContentQueue;