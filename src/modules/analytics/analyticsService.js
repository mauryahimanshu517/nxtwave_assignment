const prisma = require('../../config/prisma');

async function getTaskAnalytics(organizationId) {
  const overdueTasksPerUser = await prisma.$queryRaw`
    SELECT
      u.id            AS "userId",
      u.name          AS "userName",
      u.email         AS "userEmail",
      COUNT(t.id)::int AS "overdueCount"
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    JOIN "User"    u ON u.id = t."assigneeId"
    WHERE p."organizationId" = ${organizationId}
      AND t."dueDate" IS NOT NULL
      AND t."dueDate" < NOW()
      AND t.status <> 'DONE'
    GROUP BY u.id, u.name, u.email
    ORDER BY "overdueCount" DESC
  `;

  const [{ averageCompletionTimeHours: avg } = {}] = await prisma.$queryRaw`
    SELECT
      AVG(EXTRACT(EPOCH FROM (t."completedAt" - t."createdAt")) / 3600.0)::float
        AS "averageCompletionTimeHours"
    FROM "Task" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE p."organizationId" = ${organizationId}
      AND t."completedAt" IS NOT NULL
  `;

  return {
    overdueTasksPerUser,
    averageCompletionTimeHours: avg == null ? null : Number(avg.toFixed(2)),
  };
}

module.exports = { getTaskAnalytics };
