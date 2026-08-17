const { prisma } = require("../dist/db/prisma");
async function main() {
  const users = await prisma.user.findMany({ select: { name: true, avatarUrl: true } });
  for (const u of users) {
    console.log(u.avatarUrl ? `✅ ${u.name} → ${u.avatarUrl}` : `❌ ${u.name} → sem foto`);
  }
}
main().finally(() => prisma.$disconnect());
