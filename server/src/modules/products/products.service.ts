import { prisma } from "../../db/prisma";

export function listProducts(includeInactive = false) {
  return prisma.product.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { order: "asc" },
  });
}

export async function createProduct(data: {
  name: string;
  specifications: string;
  unitPrice?: number | null;
}) {
  const last = await prisma.product.findFirst({ orderBy: { order: "desc" } });
  return prisma.product.create({
    data: {
      name: data.name,
      specifications: data.specifications,
      unitPrice: data.unitPrice ?? null,
      order: (last?.order ?? -1) + 1,
    },
  });
}

export function updateProduct(
  id: string,
  data: { name?: string; specifications?: string; unitPrice?: number | null; active?: boolean }
) {
  return prisma.product.update({ where: { id }, data });
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
}
