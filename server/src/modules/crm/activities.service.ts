import { prisma } from "../../db/prisma";

export function addActivity(dealId: string, authorId: string, body: string) {
  return prisma.dealActivity.create({
    data: { dealId, authorId, body },
    include: { author: { select: { id: true, name: true } } },
  });
}
