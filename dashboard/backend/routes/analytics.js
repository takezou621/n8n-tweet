/**
 * Analytics Routes
 * Handles performance tracking and analytics operations
 */

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { asyncHandler, createValidationError } = require('../middleware/error-handler');
const TweetAnalytics = require('../models/TweetAnalytics');
const ContentQueue = require('../models/ContentQueue');

// Validation schemas
const daysSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30)
});

const limitSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10)
});

// GET /api/analytics/performance - Get overall performance statistics
router.get('/performance', asyncHandler(async (req, res) => {
  const { error, value } = daysSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid days parameter', error.details);
  }

  const { days } = value;

  // Get performance statistics
  const stats = await TweetAnalytics.getPerformanceStats(days);
  const categoryPerformance = await TweetAnalytics.getCategoryPerformance(days);
  const dailyStats = await TweetAnalytics.getDailyStats(days);

  res.json({
    success: true,
    data: {
      period: {
        days,
        endDate: new Date().toISOString(),
        startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      },
      overview: stats,
      categoryBreakdown: categoryPerformance,
      dailyTrends: dailyStats,
      insights: generateInsights(stats, categoryPerformance)
    }
  });
}));

// GET /api/analytics/trends - Get trending analysis
router.get('/trends', asyncHandler(async (req, res) => {
  const { error: daysError, value: daysValue } = daysSchema.validate(req.query);
  if (daysError) {
    throw createValidationError('Invalid days parameter', daysError.details);
  }

  const { error: limitError, value: limitValue } = limitSchema.validate(req.query);
  if (limitError) {
    throw createValidationError('Invalid limit parameter', limitError.details);
  }

  const { days } = daysValue;
  const { limit } = limitValue;

  // Get top performing content
  const topPerforming = await TweetAnalytics.getTopPerforming(limit, days);
  const categoryPerformance = await TweetAnalytics.getCategoryPerformance(days);

  // Calculate trends
  const trends = calculateTrends(categoryPerformance, topPerforming);

  res.json({
    success: true,
    data: {
      period: {
        days,
        limit
      },
      topPerforming: topPerforming.map(item => ({
        analytics: {
          id: item.analytics.id,
          tweetId: item.analytics.tweetId,
          engagementRate: item.analytics.engagementRate,
          likes: item.analytics.likes,
          retweets: item.analytics.retweets,
          replies: item.analytics.replies,
          impressions: item.analytics.impressions,
          totalEngagements: item.analytics.getTotalEngagements(),
          performanceCategory: item.analytics.getPerformanceCategory()
        },
        content: item.content
      })),
      categoryTrends: trends.categoryTrends,
      insights: trends.insights,
      recommendations: generateRecommendations(categoryPerformance, topPerforming)
    }
  });
}));

// GET /api/analytics/categories - Get category-specific analytics
router.get('/categories', asyncHandler(async (req, res) => {
  const { error, value } = daysSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid days parameter', error.details);
  }

  const { days } = value;
  const categoryPerformance = await TweetAnalytics.getCategoryPerformance(days);

  // Sort by performance and add rankings
  const rankedCategories = categoryPerformance
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
    .map((category, index) => ({
      ...category,
      rank: index + 1,
      performanceLevel: getPerformanceLevel(category.avgEngagementRate)
    }));

  res.json({
    success: true,
    data: {
      period: { days },
      categories: rankedCategories,
      summary: {
        totalCategories: rankedCategories.length,
        bestCategory: rankedCategories[0]?.category || null,
        worstCategory: rankedCategories[rankedCategories.length - 1]?.category || null,
        avgEngagementRate: rankedCategories.reduce((sum, cat) => sum + cat.avgEngagementRate, 0) / rankedCategories.length || 0
      }
    }
  });
}));

// GET /api/analytics/daily - Get daily performance breakdown
router.get('/daily', asyncHandler(async (req, res) => {
  const { error, value } = daysSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid days parameter', error.details);
  }

  const { days } = value;
  const dailyStats = await TweetAnalytics.getDailyStats(days);

  // Calculate week-over-week and day-over-day changes
  const enrichedStats = dailyStats.map((day, index) => {
    const prevDay = dailyStats[index + 1];
    const dayOverDayChange = prevDay ? 
      ((day.avgEngagementRate - prevDay.avgEngagementRate) / prevDay.avgEngagementRate * 100) : 0;

    return {
      ...day,
      dayOverDayChange: parseFloat(dayOverDayChange.toFixed(2)),
      isWeekend: new Date(day.date).getDay() % 6 === 0
    };
  });

  res.json({
    success: true,
    data: {
      period: { days },
      dailyStats: enrichedStats,
      trends: {
        avgEngagementRate: enrichedStats.reduce((sum, day) => sum + day.avgEngagementRate, 0) / enrichedStats.length || 0,
        peakDay: enrichedStats.reduce((max, day) => day.avgEngagementRate > max.avgEngagementRate ? day : max, enrichedStats[0] || {}),
        weekendPerformance: calculateWeekendPerformance(enrichedStats)
      }
    }
  });
}));

// POST /api/analytics/update/:tweetId - Update analytics for a specific tweet
router.post('/update/:tweetId', asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  
  const updateSchema = Joi.object({
    likes: Joi.number().integer().min(0),
    retweets: Joi.number().integer().min(0),
    replies: Joi.number().integer().min(0),
    quotes: Joi.number().integer().min(0),
    impressions: Joi.number().integer().min(0),
    urlClicks: Joi.number().integer().min(0),
    profileClicks: Joi.number().integer().min(0),
    follows: Joi.number().integer().min(0)
  });

  const { error, value } = updateSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid analytics data', error.details);
  }

  let analytics;
  try {
    analytics = await TweetAnalytics.findByTweetId(tweetId);
    await analytics.updateMetrics(value);
  } catch (err) {
    if (err.message.includes('not found')) {
      // Create new analytics record if it doesn't exist
      analytics = await TweetAnalytics.create({
        tweetId,
        ...value
      });
    } else {
      throw err;
    }
  }

  res.json({
    success: true,
    message: 'Analytics updated successfully',
    data: {
      tweetId: analytics.tweetId,
      engagementRate: analytics.engagementRate,
      totalEngagements: analytics.getTotalEngagements(),
      performanceCategory: analytics.getPerformanceCategory(),
      lastUpdated: analytics.lastFetchedAt
    }
  });
}));

// GET /api/analytics/export - Export analytics data
router.get('/export', asyncHandler(async (req, res) => {
  const { error, value } = daysSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid days parameter', error.details);
  }

  const { days } = value;
  const format = req.query.format || 'json';

  if (!['json', 'csv'].includes(format)) {
    throw createValidationError('Invalid format. Supported formats: json, csv');
  }

  // Get comprehensive data
  const stats = await TweetAnalytics.getPerformanceStats(days);
  const categoryPerformance = await TweetAnalytics.getCategoryPerformance(days);
  const dailyStats = await TweetAnalytics.getDailyStats(days);
  const topPerforming = await TweetAnalytics.getTopPerforming(50, days);

  const exportData = {
    generatedAt: new Date().toISOString(),
    period: { days },
    overview: stats,
    categories: categoryPerformance,
    daily: dailyStats,
    topPerforming: topPerforming.map(item => ({
      ...item.analytics.toDisplayFormat?.() || item.analytics,
      content: item.content
    }))
  };

  if (format === 'csv') {
    // Convert to CSV format
    const csv = convertToCSV(exportData);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${days}days-${Date.now()}.csv"`);
    res.send(csv);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${days}days-${Date.now()}.json"`);
    res.json(exportData);
  }
}));

// Helper functions
function generateInsights(stats, categoryPerformance) {
  const insights = [];

  if (stats.avgEngagementRate > 3) {
    insights.push({
      type: 'positive',
      message: `Excellent engagement rate of ${stats.avgEngagementRate.toFixed(2)}%`,
      category: 'engagement'
    });
  } else if (stats.avgEngagementRate < 1) {
    insights.push({
      type: 'warning',
      message: `Low engagement rate of ${stats.avgEngagementRate.toFixed(2)}%. Consider reviewing content strategy.`,
      category: 'engagement'
    });
  }

  const bestCategory = categoryPerformance.reduce((max, cat) => 
    cat.avgEngagementRate > max.avgEngagementRate ? cat : max, categoryPerformance[0] || {});
  
  if (bestCategory.category) {
    insights.push({
      type: 'info',
      message: `"${bestCategory.category}" category performs best with ${bestCategory.avgEngagementRate.toFixed(2)}% engagement`,
      category: 'strategy'
    });
  }

  return insights;
}

function calculateTrends(categoryPerformance, topPerforming) {
  const categoryTrends = categoryPerformance.map(category => ({
    category: category.category,
    engagementRate: category.avgEngagementRate,
    tweetCount: category.tweetCount,
    trend: category.avgEngagementRate > 2 ? 'up' : category.avgEngagementRate < 1 ? 'down' : 'stable'
  }));

  const insights = [];
  const highPerformers = topPerforming.filter(item => item.analytics.engagementRate > 3);
  
  if (highPerformers.length > 0) {
    insights.push(`${highPerformers.length} tweets achieved excellent engagement (>3%)`);
  }

  return { categoryTrends, insights };
}

function generateRecommendations(categoryPerformance, topPerforming) {
  const recommendations = [];

  // Category recommendations
  const sortedCategories = categoryPerformance.sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  if (sortedCategories.length > 0) {
    recommendations.push({
      type: 'category',
      priority: 'high',
      message: `Focus more on "${sortedCategories[0].category}" content - it has the highest engagement rate`
    });
  }

  // Timing recommendations
  if (topPerforming.length > 0) {
    recommendations.push({
      type: 'timing',
      priority: 'medium',
      message: 'Analyze posting times of top-performing tweets to optimize scheduling'
    });
  }

  return recommendations;
}

function getPerformanceLevel(engagementRate) {
  if (engagementRate >= 5) return 'excellent';
  if (engagementRate >= 3) return 'good';
  if (engagementRate >= 1) return 'average';
  return 'poor';
}

function calculateWeekendPerformance(dailyStats) {
  const weekendStats = dailyStats.filter(day => day.isWeekend);
  const weekdayStats = dailyStats.filter(day => !day.isWeekend);

  const weekendAvg = weekendStats.reduce((sum, day) => sum + day.avgEngagementRate, 0) / weekendStats.length || 0;
  const weekdayAvg = weekdayStats.reduce((sum, day) => sum + day.avgEngagementRate, 0) / weekdayStats.length || 0;

  return {
    weekendAverage: parseFloat(weekendAvg.toFixed(2)),
    weekdayAverage: parseFloat(weekdayAvg.toFixed(2)),
    difference: parseFloat((weekendAvg - weekdayAvg).toFixed(2)),
    performsBetter: weekendAvg > weekdayAvg ? 'weekend' : 'weekday'
  };
}

function convertToCSV(data) {
  // Simple CSV conversion for daily stats
  const headers = ['Date', 'Tweet Count', 'Avg Engagement Rate', 'Total Likes', 'Total Retweets', 'Total Impressions'];
  const rows = data.daily.map(day => [
    day.date,
    day.tweetCount,
    day.avgEngagementRate,
    day.totalLikes,
    day.totalRetweets,
    day.totalImpressions
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

module.exports = router;