import { PrismaClient } from "../src/generated/prisma/index.js";
const p = new PrismaClient();
const r = await p.board.updateMany({ where: { isDefault: false }, data: { isDefault: true } });
console.log("Boards marked as default:", r.count);
await p.$disconnect();
