const { prisma } = require("../dist/db/prisma");
async function main() {
  const total = await prisma.deal.count();
  const contacts = await prisma.contact.count();
  console.log("Total deals:", total);
  console.log("Total contacts:", contacts);
  const stages = await prisma.crmStage.findMany({ orderBy: { order: "asc" } });
  for (const s of stages) {
    const c = await prisma.deal.count({ where: { stageId: s.id } });
    if (c > 0) console.log(" ", s.name, "->", c);
  }
}
main().finally(() => prisma.$disconnect());
