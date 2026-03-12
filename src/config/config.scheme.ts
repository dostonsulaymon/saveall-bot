import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  // Bot Configuration
  BOT_TOKEN: Joi.string().required(),
  ADMIN_ID: Joi.string().required(),
  USE_LOCAL_BOT_API: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
  TELEGRAM_API_ROOT: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').when('USE_LOCAL_BOT_API', {
    is: true,
    then: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
    otherwise: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  }),

  // Database Configuration
  MONGODB_URI: Joi.string().required(),

  // Cache Configuration
  CACHE_DAYS: Joi.number().default(30),

  // File Configuration
  MAX_FILE_SIZE: Joi.number().default(50 * 1024 * 1024), // 50MB
  DOWNLOAD_DIR: Joi.string().default('downloads'),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  STARTUP_STRICT_DEPENDENCY_CHECKS: Joi.boolean()
    .truthy('true')
    .truthy('1')
    .falsy('false')
    .falsy('0')
    .optional(),
  DOWNLOAD_WORKER_CONCURRENCY: Joi.number().integer().min(1).default(10),
  DOWNLOAD_RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(3),
  DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(30),

  // Bull Board (optional)
  BULL_BOARD_USERNAME: Joi.string().allow('').optional(),
  BULL_BOARD_PASSWORD: Joi.string().allow('').optional(),
}).and('BULL_BOARD_USERNAME', 'BULL_BOARD_PASSWORD');
