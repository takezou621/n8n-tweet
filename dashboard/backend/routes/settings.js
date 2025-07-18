/**
 * Settings Routes
 * Handles keyword filters and scheduling configuration
 */

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { asyncHandler, createValidationError, createNotFoundError, createConflictError } = require('../middleware/error-handler');
const KeywordFilter = require('../models/KeywordFilter');

// Validation schemas
const keywordCreateSchema = Joi.object({
  keyword: Joi.string().required().min(1).max(255).trim(),
  category: Joi.string().required().min(1).max(100).trim(),
  priority: Joi.number().integer().min(1).max(5).default(1),
  weight: Joi.number().min(0).max(5).default(1.0),
  isActive: Joi.boolean().default(true),
  isExclude: Joi.boolean().default(false),
  description: Joi.string().max(500).allow('').trim()
});

const keywordUpdateSchema = Joi.object({
  keyword: Joi.string().min(1).max(255).trim(),
  category: Joi.string().min(1).max(100).trim(),
  priority: Joi.number().integer().min(1).max(5),
  weight: Joi.number().min(0).max(5),
  isActive: Joi.boolean(),
  isExclude: Joi.boolean(),
  description: Joi.string().max(500).allow('').trim()
});

const keywordFiltersSchema = Joi.object({
  category: Joi.string().max(100),
  isActive: Joi.boolean(),
  isExclude: Joi.boolean(),
  minPriority: Joi.number().integer().min(1).max(5),
  search: Joi.string().max(255)
});

const scheduleSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  timezone: Joi.string().default('UTC'),
  postingTimes: Joi.array().items(
    Joi.object({
      hour: Joi.number().integer().min(0).max(23).required(),
      minute: Joi.number().integer().min(0).max(59).default(0),
      enabled: Joi.boolean().default(true)
    })
  ).min(1).max(24),
  postingDays: Joi.array().items(
    Joi.number().integer().min(0).max(6)
  ).min(1).max(7).default([1, 2, 3, 4, 5]), // Monday-Friday
  maxPostsPerDay: Joi.number().integer().min(1).max(50).default(10),
  minIntervalMinutes: Joi.number().integer().min(15).max(1440).default(60),
  pausePeriods: Joi.array().items(
    Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
      reason: Joi.string().max(255)
    })
  ).default([])
});

// GET /api/settings/keywords - Get all keyword filters
router.get('/keywords', asyncHandler(async (req, res) => {
  const { error, value } = keywordFiltersSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid filter parameters', error.details);
  }

  const filters = await KeywordFilter.findAll(value);
  const stats = await KeywordFilter.getStats();
  const categories = await KeywordFilter.getCategories();

  res.json({
    success: true,
    data: {
      filters: filters.map(filter => filter.toDisplayFormat()),
      stats,
      categories,
      appliedFilters: value
    }
  });
}));

// POST /api/settings/keywords - Create new keyword filter
router.post('/keywords', asyncHandler(async (req, res) => {
  const { error, value } = keywordCreateSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid keyword data', error.details);
  }

  // Check if keyword already exists
  const existingKeyword = await KeywordFilter.findByKeyword(value.keyword);
  if (existingKeyword) {
    throw createConflictError(`Keyword "${value.keyword}" already exists`);
  }

  value.createdBy = req.user.id;
  const filter = await KeywordFilter.create(value);

  res.status(201).json({
    success: true,
    message: 'Keyword filter created successfully',
    data: filter.toDisplayFormat()
  });
}));

// GET /api/settings/keywords/:id - Get specific keyword filter
router.get('/keywords/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid keyword filter ID');
  }

  const filter = await KeywordFilter.findById(id);
  
  res.json({
    success: true,
    data: filter.toDisplayFormat()
  });
}));

// PUT /api/settings/keywords/:id - Update keyword filter
router.put('/keywords/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid keyword filter ID');
  }

  const { error, value } = keywordUpdateSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid keyword data', error.details);
  }

  // Check if keyword already exists (excluding current record)
  if (value.keyword) {
    const keywordExists = await KeywordFilter.keywordExists(value.keyword, id);
    if (keywordExists) {
      throw createConflictError(`Keyword "${value.keyword}" already exists`);
    }
  }

  const filter = await KeywordFilter.findById(id);
  Object.assign(filter, value);
  await filter.save();

  res.json({
    success: true,
    message: 'Keyword filter updated successfully',
    data: filter.toDisplayFormat()
  });
}));

// DELETE /api/settings/keywords/:id - Delete keyword filter
router.delete('/keywords/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid keyword filter ID');
  }

  const filter = await KeywordFilter.findById(id);
  await filter.delete();

  res.json({
    success: true,
    message: 'Keyword filter deleted successfully',
    data: { id }
  });
}));

// POST /api/settings/keywords/:id/toggle - Toggle keyword filter active status
router.post('/keywords/:id/toggle', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid keyword filter ID');
  }

  const filter = await KeywordFilter.findById(id);
  await filter.toggleActive();

  res.json({
    success: true,
    message: `Keyword filter ${filter.isActive ? 'activated' : 'deactivated'} successfully`,
    data: {
      id: filter.id,
      keyword: filter.keyword,
      isActive: filter.isActive
    }
  });
}));

// POST /api/settings/keywords/test-relevance - Test content relevance scoring
router.post('/keywords/test-relevance', asyncHandler(async (req, res) => {
  const testSchema = Joi.object({
    title: Joi.string().required().min(1).max(500),
    description: Joi.string().max(2000).default('')
  });

  const { error, value } = testSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid test content', error.details);
  }

  const result = await KeywordFilter.calculateRelevanceScore(value);

  res.json({
    success: true,
    data: {
      content: value,
      relevanceScore: result.score,
      matchedKeywords: result.matchedKeywords,
      excluded: result.excluded,
      recommendations: generateScoreRecommendations(result)
    }
  });
}));

// GET /api/settings/keywords/categories - Get all keyword categories
router.get('/keywords/categories', asyncHandler(async (req, res) => {
  const categories = await KeywordFilter.getCategories();
  
  // Get stats for each category
  const categoryStats = [];
  for (const category of categories) {
    const filters = await KeywordFilter.findByCategory(category, false);
    const activeFilters = filters.filter(f => f.isActive);
    
    categoryStats.push({
      name: category,
      totalFilters: filters.length,
      activeFilters: activeFilters.length,
      avgPriority: filters.reduce((sum, f) => sum + f.priority, 0) / filters.length || 0,
      avgWeight: filters.reduce((sum, f) => sum + f.weight, 0) / filters.length || 0
    });
  }

  res.json({
    success: true,
    data: {
      categories: categoryStats,
      totalCategories: categories.length
    }
  });
}));

// GET /api/settings/schedule - Get posting schedule configuration
router.get('/schedule', asyncHandler(async (req, res) => {
  // For now, return default schedule (in a real app, this would be stored in database)
  const defaultSchedule = {
    enabled: true,
    timezone: 'Asia/Tokyo',
    postingTimes: [
      { hour: 6, minute: 0, enabled: true },
      { hour: 12, minute: 0, enabled: true },
      { hour: 18, minute: 0, enabled: true }
    ],
    postingDays: [1, 2, 3, 4, 5], // Monday-Friday
    maxPostsPerDay: 5,
    minIntervalMinutes: 120,
    pausePeriods: []
  };

  res.json({
    success: true,
    data: {
      schedule: defaultSchedule,
      nextScheduledPost: calculateNextScheduledPost(defaultSchedule),
      status: defaultSchedule.enabled ? 'active' : 'paused'
    }
  });
}));

// PUT /api/settings/schedule - Update posting schedule
router.put('/schedule', asyncHandler(async (req, res) => {
  const { error, value } = scheduleSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid schedule data', error.details);
  }

  // In a real app, save to database
  // For now, just validate and return the new schedule
  
  res.json({
    success: true,
    message: 'Posting schedule updated successfully',
    data: {
      schedule: value,
      nextScheduledPost: calculateNextScheduledPost(value),
      status: value.enabled ? 'active' : 'paused'
    }
  });
}));

// POST /api/settings/schedule/pause - Pause posting schedule
router.post('/schedule/pause', asyncHandler(async (req, res) => {
  const pauseSchema = Joi.object({
    duration: Joi.number().integer().min(1).max(24).required(), // hours
    reason: Joi.string().max(255)
  });

  const { error, value } = pauseSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid pause data', error.details);
  }

  const pauseUntil = new Date(Date.now() + value.duration * 60 * 60 * 1000);

  res.json({
    success: true,
    message: `Posting paused for ${value.duration} hours`,
    data: {
      pausedUntil: pauseUntil.toISOString(),
      reason: value.reason,
      duration: value.duration
    }
  });
}));

// POST /api/settings/schedule/resume - Resume posting schedule
router.post('/schedule/resume', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Posting schedule resumed',
    data: {
      status: 'active',
      resumedAt: new Date().toISOString()
    }
  });
}));

// GET /api/settings/general - Get general application settings
router.get('/general', asyncHandler(async (req, res) => {
  const settings = {
    application: {
      name: 'Intelligent Content Dashboard',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    },
    features: {
      autoApproval: false,
      duplicateDetection: true,
      analyticsTracking: true,
      scheduledPosting: true
    },
    limits: {
      maxQueueSize: 1000,
      maxKeywordFilters: 500,
      maxTemplates: 100,
      maxDailyPosts: 50
    },
    integrations: {
      twitter: {
        enabled: true,
        version: 'v2'
      },
      n8n: {
        enabled: true,
        workflowActive: true
      }
    }
  };

  res.json({
    success: true,
    data: settings
  });
}));

// Helper functions
function generateScoreRecommendations(result) {
  const recommendations = [];

  if (result.excluded) {
    recommendations.push({
      type: 'warning',
      message: 'Content contains exclude keywords and will be filtered out'
    });
  } else if (result.score < 1) {
    recommendations.push({
      type: 'suggestion',
      message: 'Consider adding more relevant keywords to improve content matching'
    });
  } else if (result.score > 3) {
    recommendations.push({
      type: 'success',
      message: 'Content has high relevance score and will likely be selected'
    });
  }

  if (result.matchedKeywords.length === 0) {
    recommendations.push({
      type: 'info',
      message: 'No keywords matched - content may not be relevant to current filters'
    });
  }

  return recommendations;
}

function calculateNextScheduledPost(schedule) {
  if (!schedule.enabled) {
    return null;
  }

  const now = new Date();
  const nextPosts = [];

  // Calculate next post for each enabled time slot
  schedule.postingTimes.forEach(time => {
    if (!time.enabled) return;

    // For each day in posting days
    schedule.postingDays.forEach(dayOfWeek => {
      const next = new Date();
      next.setHours(time.hour, time.minute, 0, 0);
      
      // Adjust to the correct day of week
      const currentDay = next.getDay();
      const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
      
      if (daysToAdd === 0 && next <= now) {
        // If it's today but time has passed, schedule for next week
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + daysToAdd);
      }

      nextPosts.push(next);
    });
  });

  // Return the earliest upcoming post
  nextPosts.sort((a, b) => a - b);
  return nextPosts[0]?.toISOString() || null;
}

module.exports = router;