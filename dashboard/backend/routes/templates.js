/**
 * Template Routes
 * Handles tweet template management
 */

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { asyncHandler, createValidationError, createConflictError } = require('../middleware/error-handler');
const TweetTemplate = require('../models/TweetTemplate');

// Validation schemas
const templateCreateSchema = Joi.object({
  name: Joi.string().required().min(1).max(255).trim(),
  template: Joi.string().required().min(1).max(500).trim(),
  category: Joi.string().required().min(1).max(100).trim(),
  maxLength: Joi.number().integer().min(1).max(500).default(280),
  isActive: Joi.boolean().default(true),
  description: Joi.string().max(500).allow('').trim()
});

const templateUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).trim(),
  template: Joi.string().min(1).max(500).trim(),
  category: Joi.string().min(1).max(100).trim(),
  maxLength: Joi.number().integer().min(1).max(500),
  isActive: Joi.boolean(),
  description: Joi.string().max(500).allow('').trim()
});

const templateFiltersSchema = Joi.object({
  category: Joi.string().max(100),
  isActive: Joi.boolean(),
  search: Joi.string().max(255),
  sortBy: Joi.string().valid('usage', 'success', 'name').default('name')
});

const previewSchema = Joi.object({
  title: Joi.string().default('Sample AI Research Title'),
  url: Joi.string().uri().default('https://example.com/article'),
  hashtags: Joi.string().default('#AI #MachineLearning'),
  source: Joi.string().default('AI Research Blog'),
  author: Joi.string().default('Dr. AI Researcher')
});

// GET /api/templates - Get all templates
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = templateFiltersSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid filter parameters', error.details);
  }

  const templates = await TweetTemplate.findAll(value);
  const stats = await TweetTemplate.getStats();
  const categories = await TweetTemplate.getCategories();

  res.json({
    success: true,
    data: {
      templates: templates.map(template => template.toDisplayFormat()),
      stats,
      categories,
      appliedFilters: value
    }
  });
}));

// POST /api/templates - Create new template
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = templateCreateSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid template data', error.details);
  }

  // Check if template name already exists
  const existingTemplate = await TweetTemplate.findByName(value.name);
  if (existingTemplate) {
    throw createConflictError(`Template "${value.name}" already exists`);
  }

  value.createdBy = req.user.id;
  const template = await TweetTemplate.create(value);

  res.status(201).json({
    success: true,
    message: 'Template created successfully',
    data: template.toDisplayFormat()
  });
}));

// GET /api/templates/:id - Get specific template
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid template ID');
  }

  const template = await TweetTemplate.findById(id);
  
  res.json({
    success: true,
    data: template.toDisplayFormat()
  });
}));

// PUT /api/templates/:id - Update template
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid template ID');
  }

  const { error, value } = templateUpdateSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid template data', error.details);
  }

  // Check if template name already exists (excluding current record)
  if (value.name) {
    const nameExists = await TweetTemplate.nameExists(value.name, id);
    if (nameExists) {
      throw createConflictError(`Template "${value.name}" already exists`);
    }
  }

  const template = await TweetTemplate.findById(id);
  Object.assign(template, value);
  await template.save();

  res.json({
    success: true,
    message: 'Template updated successfully',
    data: template.toDisplayFormat()
  });
}));

// DELETE /api/templates/:id - Delete template
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid template ID');
  }

  const template = await TweetTemplate.findById(id);
  await template.delete();

  res.json({
    success: true,
    message: 'Template deleted successfully',
    data: { id }
  });
}));

// POST /api/templates/:id/toggle - Toggle template active status
router.post('/:id/toggle', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid template ID');
  }

  const template = await TweetTemplate.findById(id);
  await template.toggleActive();

  res.json({
    success: true,
    message: `Template ${template.isActive ? 'activated' : 'deactivated'} successfully`,
    data: {
      id: template.id,
      name: template.name,
      isActive: template.isActive
    }
  });
}));

// POST /api/templates/:id/preview - Preview template with custom data
router.post('/:id/preview', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid template ID');
  }

  const { error, value } = previewSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid preview data', error.details);
  }

  const template = await TweetTemplate.findById(id);
  const generatedTweet = template.generateTweet(value);
  const validation = template.validateWithContent(value);

  res.json({
    success: true,
    data: {
      template: {
        id: template.id,
        name: template.name,
        template: template.template,
        variables: template.variables
      },
      input: value,
      output: {
        generatedTweet,
        length: generatedTweet.length,
        validation
      }
    }
  });
}));

// POST /api/templates/test-generate - Test template generation without saving
router.post('/test-generate', asyncHandler(async (req, res) => {
  const testSchema = Joi.object({
    template: Joi.string().required().min(1).max(500),
    data: previewSchema
  });

  const { error, value } = testSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid test data', error.details);
  }

  // Create temporary template instance for testing
  const tempTemplate = new TweetTemplate({
    template: value.template,
    maxLength: 280
  });

  const generatedTweet = tempTemplate.generateTweet(value.data);
  const validation = tempTemplate.validateWithContent(value.data);

  res.json({
    success: true,
    data: {
      template: value.template,
      variables: tempTemplate.variables,
      input: value.data,
      output: {
        generatedTweet,
        length: generatedTweet.length,
        validation
      }
    }
  });
}));

// GET /api/templates/categories - Get template categories with stats
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await TweetTemplate.getCategories();
  
  // Get stats for each category
  const categoryStats = [];
  for (const category of categories) {
    const templates = await TweetTemplate.findByCategory(category, false);
    const activeTemplates = templates.filter(t => t.isActive);
    
    const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);
    const avgSuccessRate = templates.reduce((sum, t) => sum + t.successRate, 0) / templates.length || 0;
    
    categoryStats.push({
      name: category,
      totalTemplates: templates.length,
      activeTemplates: activeTemplates.length,
      totalUsage,
      avgSuccessRate: parseFloat(avgSuccessRate.toFixed(2))
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

// GET /api/templates/best-performing - Get best performing templates
router.get('/best-performing', asyncHandler(async (req, res) => {
  const limitSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10)
  });

  const { error, value } = limitSchema.validate(req.query);
  if (error) {
    throw createValidationError('Invalid limit parameter', error.details);
  }

  const bestTemplates = await TweetTemplate.getBestPerforming(value.limit);

  res.json({
    success: true,
    data: {
      templates: bestTemplates.map(template => ({
        ...template.toDisplayFormat(),
        performanceMetrics: {
          usageCount: template.usageCount,
          successRate: template.successRate,
          avgScore: template.getWeightedScore?.() || 0
        }
      })),
      summary: {
        totalTemplates: bestTemplates.length,
        avgSuccessRate: bestTemplates.reduce((sum, t) => sum + t.successRate, 0) / bestTemplates.length || 0,
        totalUsage: bestTemplates.reduce((sum, t) => sum + t.usageCount, 0)
      }
    }
  });
}));

// POST /api/templates/:id/use - Record template usage (for analytics)
router.post('/:id/use', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid template ID');
  }

  const usageSchema = Joi.object({
    successful: Joi.boolean().default(true),
    generatedTweet: Joi.string().max(280),
    finalTweet: Joi.string().max(280)
  });

  const { error, value } = usageSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid usage data', error.details);
  }

  const template = await TweetTemplate.findById(id);
  
  // Increment usage count
  await template.incrementUsage();
  
  // Update success rate if provided
  if (typeof value.successful === 'boolean') {
    await template.updateSuccessRate(value.successful);
  }

  res.json({
    success: true,
    message: 'Template usage recorded successfully',
    data: {
      id: template.id,
      name: template.name,
      usageCount: template.usageCount,
      successRate: template.successRate
    }
  });
}));

// GET /api/templates/variables - Get available template variables
router.get('/variables', asyncHandler(async (req, res) => {
  const availableVariables = [
    {
      name: 'title',
      description: 'Article or content title',
      example: 'Revolutionary AI Breakthrough in Natural Language Processing',
      required: true
    },
    {
      name: 'url',
      description: 'Link to the original content',
      example: 'https://example.com/ai-breakthrough',
      required: false
    },
    {
      name: 'hashtags',
      description: 'Relevant hashtags for the content',
      example: '#AI #MachineLearning #NLP',
      required: false
    },
    {
      name: 'source',
      description: 'Source publication or website name',
      example: 'AI Research Journal',
      required: false
    },
    {
      name: 'author',
      description: 'Content author name',
      example: 'Dr. Jane Smith',
      required: false
    },
    {
      name: 'category',
      description: 'Content category',
      example: 'research',
      required: false
    },
    {
      name: 'summary',
      description: 'Brief content summary',
      example: 'New AI model achieves 95% accuracy in language understanding tasks',
      required: false
    }
  ];

  res.json({
    success: true,
    data: {
      variables: availableVariables,
      usage: {
        syntax: '{variableName}',
        examples: [
          'Breaking: {title} {url} {hashtags}',
          'New from {source}: {title} - {summary} {url}',
          'Must read: {title} by {author} {hashtags} {url}'
        ]
      }
    }
  });
}));

module.exports = router;