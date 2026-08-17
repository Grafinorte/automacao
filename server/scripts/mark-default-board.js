// node scripts/mark-default-board.js
const { PrismaClient } = require("../src/generated/prisma");
const p = new PrismaClient();
p.board.updateMany({ where: { isDefault: false }, data: { isDefault: true } })
  .then((r) => console.log("Boards marked as default:", r.count))
  .finally(() => p.$disconnect());
