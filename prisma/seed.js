const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'Acme Inc.' },
  });

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const users = [
    { email: 'admin@acme.test',   name: 'Ada Admin',     role: 'ADMIN' },
    { email: 'manager@acme.test', name: 'Marco Manager', role: 'MANAGER' },
    { email: 'member@acme.test',  name: 'Maya Member',   role: 'MEMBER' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, organizationId: org.id },
    });
  }

  console.log('Seed complete. Login with admin@acme.test / Password123!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
