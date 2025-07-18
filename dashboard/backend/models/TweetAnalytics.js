/**
 * TweetAnalytics Model
 * Manages tweet performance data and analytics
 */

const { database } = require('../services/database');
const { createNotFoundError, createValidationError } = require('../middleware/error-handler');

class TweetAnalytics {
  constructor(data = {}) {
    this.id = data.id;
    this.contentQueueId = data.content_queue_id || data.contentQueueId;
    this.tweetId = data.tweet_id || data.tweetId;
    this.retweets = data.retweets || 0;
    this.likes = data.likes || 0;
    this.replies = data.replies || 0;
    this.quotes = data.quotes || 0;
    this.impressions = data.impressions || 0;
    this.engagementRate = data.engagement_rate || data.engagementRate || 0.0;
    this.urlClicks = data.url_clicks || data.urlClicks || 0;
    this.profileClicks = data.profile_clicks || data.profileClicks || 0;
    this.follows = data.follows || 0;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.lastFetchedAt = data.last_fetched_at || data.lastFetchedAt;
  }

  // Validation
  validate() {
    const errors = [];

    if (!this.tweetId || this.tweetId.trim().length === 0) {
      errors.push({ field: 'tweetId', message: 'Tweet ID is required' });
    }

    // Validate numeric fields are non-negative
    const numericFields = ['retweets', 'likes', 'replies', 'quotes', 'impressions', 'urlClicks', 'profileClicks', 'follows'];
    numericFields.forEach(field => {
      const value = this[field];
      if (value && (typeof value !== 'number' || value < 0)) {
        errors.push({ field, message: `${field} must be a non-negative number` });
      }
    });

    if (this.engagementRate && (this.engagementRate < 0 || this.engagementRate > 100)) {
      errors.push({ field: 'engagementRate', message: 'Engagement rate must be between 0 and 100' });
    }

    if (errors.length > 0) {
      throw createValidationError('Tweet analytics validation failed', errors);
    }
  }

  // Calculate engagement rate
  calculateEngagementRate() {
    if (!this.impressions || this.impressions === 0) {
      return 0;
    }
    
    const totalEngagements = this.likes + this.retweets + this.replies + this.quotes;
    this.engagementRate = Number(((totalEngagements / this.impressions) * 100).toFixed(2));
    return this.engagementRate;
  }

  // Convert to database format
  toDbFormat() {
    return {
      content_queue_id: this.contentQueueId,
      tweet_id: this.tweetId,
      retweets: this.retweets,
      likes: this.likes,
      replies: this.replies,
      quotes: this.quotes,
      impressions: this.impressions,
      engagement_rate: this.engagementRate,
      url_clicks: this.urlClicks,
      profile_clicks: this.profileClicks,
      follows: this.follows,
      last_fetched_at: this.lastFetchedAt || new Date()
    };
  }

  // Static methods for database operations
  static async create(data) {
    const analytics = new TweetAnalytics(data);
    analytics.calculateEngagementRate();
    analytics.validate();

    const dbData = analytics.toDbFormat();
    const result = await database.insert('tweet_performance', dbData);
    return new TweetAnalytics(result);
  }

  static async findById(id) {
    const result = await database.findById('tweet_performance', id);
    if (!result) {
      throw createNotFoundError(`Tweet analytics with id ${id} not found`);
    }
    return new TweetAnalytics(result);
  }

  static async findByTweetId(tweetId) {
    const query = 'SELECT * FROM tweet_performance WHERE tweet_id = $1';
    const result = await database.query(query, [tweetId]);
    if (result.rows.length === 0) {
      throw createNotFoundError(`Tweet analytics for tweet ${tweetId} not found`);
    }
    return new TweetAnalytics(result.rows[0]);
  }

  static async findByContentQueueId(contentQueueId) {
    const query = 'SELECT * FROM tweet_performance WHERE content_queue_id = $1';
    const result = await database.query(query, [contentQueueId]);
    if (result.rows.length === 0) {
      return null;
    }
    return new TweetAnalytics(result.rows[0]);
  }

  static async getTopPerforming(limit = 10, days = 30) {
    const query = `
      SELECT tp.*, cq.title, cq.category, cq.source_feed
      FROM tweet_performance tp
      JOIN content_queue cq ON tp.content_queue_id = cq.id
      WHERE tp.created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY tp.engagement_rate DESC, tp.likes DESC
      LIMIT $1
    `;
    const result = await database.query(query, [limit]);
    return result.rows.map(row => ({
      analytics: new TweetAnalytics(row),
      content: {
        title: row.title,
        category: row.category,
        sourceFeed: row.source_feed
      }
    }));
  }

  static async getPerformanceStats(days = 30) {
    const query = `
      SELECT 
        COUNT(*) as total_tweets,
        AVG(engagement_rate) as avg_engagement_rate,
        AVG(likes) as avg_likes,
        AVG(retweets) as avg_retweets,
        AVG(replies) as avg_replies,
        MAX(engagement_rate) as best_engagement_rate,
        SUM(impressions) as total_impressions,
        SUM(likes + retweets + replies + quotes) as total_engagements
      FROM tweet_performance 
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;
    const result = await database.query(query);
    const stats = result.rows[0];
    
    return {
      totalTweets: parseInt(stats.total_tweets),
      avgEngagementRate: parseFloat(stats.avg_engagement_rate) || 0,
      avgLikes: parseFloat(stats.avg_likes) || 0,
      avgRetweets: parseFloat(stats.avg_retweets) || 0,
      avgReplies: parseFloat(stats.avg_replies) || 0,
      bestEngagementRate: parseFloat(stats.best_engagement_rate) || 0,
      totalImpressions: parseInt(stats.total_impressions) || 0,
      totalEngagements: parseInt(stats.total_engagements) || 0
    };
  }

  static async getCategoryPerformance(days = 30) {
    const query = `
      SELECT 
        cq.category,
        COUNT(*) as tweet_count,
        AVG(tp.engagement_rate) as avg_engagement_rate,
        AVG(tp.likes) as avg_likes,
        SUM(tp.impressions) as total_impressions
      FROM tweet_performance tp
      JOIN content_queue cq ON tp.content_queue_id = cq.id
      WHERE tp.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY cq.category
      ORDER BY avg_engagement_rate DESC
    `;
    const result = await database.query(query);
    
    return result.rows.map(row => ({
      category: row.category,
      tweetCount: parseInt(row.tweet_count),
      avgEngagementRate: parseFloat(row.avg_engagement_rate) || 0,
      avgLikes: parseFloat(row.avg_likes) || 0,
      totalImpressions: parseInt(row.total_impressions) || 0
    }));
  }

  static async getDailyStats(days = 30) {
    const query = `
      SELECT 
        DATE(tp.created_at) as date,
        COUNT(*) as tweet_count,
        AVG(tp.engagement_rate) as avg_engagement_rate,
        SUM(tp.likes) as total_likes,
        SUM(tp.retweets) as total_retweets,
        SUM(tp.impressions) as total_impressions
      FROM tweet_performance tp
      WHERE tp.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(tp.created_at)
      ORDER BY date DESC
    `;
    const result = await database.query(query);
    
    return result.rows.map(row => ({
      date: row.date,
      tweetCount: parseInt(row.tweet_count),
      avgEngagementRate: parseFloat(row.avg_engagement_rate) || 0,
      totalLikes: parseInt(row.total_likes) || 0,
      totalRetweets: parseInt(row.total_retweets) || 0,
      totalImpressions: parseInt(row.total_impressions) || 0
    }));
  }

  static async getNeedingUpdate(olderThanHours = 1) {
    const query = `
      SELECT * FROM tweet_performance 
      WHERE last_fetched_at < NOW() - INTERVAL '${olderThanHours} hours'
      ORDER BY last_fetched_at ASC
    `;
    const result = await database.query(query);
    return result.rows.map(row => new TweetAnalytics(row));
  }

  // Instance methods
  async save() {
    this.calculateEngagementRate();
    this.validate();

    if (this.id) {
      const dbData = this.toDbFormat();
      const result = await database.update('tweet_performance', this.id, dbData);
      Object.assign(this, new TweetAnalytics(result));
    } else {
      const result = await TweetAnalytics.create(this.toDbFormat());
      Object.assign(this, result);
    }

    return this;
  }

  async updateMetrics(metrics) {
    this.retweets = metrics.retweets || this.retweets;
    this.likes = metrics.likes || this.likes;
    this.replies = metrics.replies || this.replies;
    this.quotes = metrics.quotes || this.quotes;
    this.impressions = metrics.impressions || this.impressions;
    this.urlClicks = metrics.urlClicks || this.urlClicks;
    this.profileClicks = metrics.profileClicks || this.profileClicks;
    this.follows = metrics.follows || this.follows;
    this.lastFetchedAt = new Date();
    
    return await this.save();
  }

  async delete() {
    if (!this.id) {
      throw createValidationError('Cannot delete tweet analytics without id');
    }
    return await database.delete('tweet_performance', this.id);
  }

  // Get total engagements
  getTotalEngagements() {
    return this.likes + this.retweets + this.replies + this.quotes;
  }

  // Check if data is stale
  isStale(hours = 1) {
    if (!this.lastFetchedAt) return true;
    const now = new Date();
    const fetched = new Date(this.lastFetchedAt);
    const diffHours = (now - fetched) / (1000 * 60 * 60);
    return diffHours >= hours;
  }

  // Get performance category based on engagement rate
  getPerformanceCategory() {
    if (this.engagementRate >= 5) return 'excellent';
    if (this.engagementRate >= 3) return 'good';
    if (this.engagementRate >= 1) return 'average';
    return 'poor';
  }
}

module.exports = TweetAnalytics;