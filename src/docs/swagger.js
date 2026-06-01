const swaggerJsdoc = require('swagger-jsdoc');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Team Task Tracker API',
      version: '1.0.0',
      description:
        'REST API for a team-based task tracker with JWT auth (with refresh rotation), ' +
        'role-based access control, Redis-cached task listings, and PostgreSQL persistence.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            status:  { type: 'integer', example: 400 },
            code:    { type: 'string',  example: 'VALIDATION_ERROR' },
            message: { type: 'string',  example: 'dueDate must be a future date' },
            details: { type: 'object', additionalProperties: true },
          },
        },
        Task: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            projectId:   { type: 'string', format: 'uuid' },
            title:       { type: 'string' },
            description: { type: 'string', nullable: true },
            priority:    { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
            status:      { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED'] },
            assigneeId:  { type: 'string', format: 'uuid', nullable: true },
            dueDate:     { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt:   { type: 'string', format: 'date-time' },
            updatedAt:   { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth' },
      { name: 'Users' },
      { name: 'Projects' },
      { name: 'Tasks' },
      { name: 'Analytics' },
    ],
  },
  apis: ['src/modules/**/*.js'],
});

module.exports = swaggerSpec;
