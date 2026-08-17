import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { IssuingCompany } from "../../generated/prisma/client";

const LIST_SELECT = {
  id: true,
  number: true,
  issuingCompany: true,
  clientName: true,
  clientContact: true,
  validUntil: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  items: { select: { quantity: true, unitPrice: true } },
} as const;

export async function listQuotes() {
  const quotes = await prisma.quote.findMany({
    select: LIST_SELECT,
    orderBy: { number: "desc" },
  });
  return quotes.map(({ items, ...quote }) => ({
    ...quote,
    total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  }));
}

export function getQuote(id: string) {
  return prisma.quote.findUniqueOrThrow({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export interface QuoteItemInput {
  productId?: string | null;
  productName: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
}

export async function createQuote(data: {
  issuingCompany: IssuingCompany;
  clientName: string;
  clientContact?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  createdById: string;
  items: QuoteItemInput[];
}) {
  if (!data.items.length) {
    throw new HttpError(400, "Adicione ao menos um item ao orçamento");
  }

  const last = await prisma.quote.findFirst({ orderBy: { number: "desc" } });
  const number = (last?.number ?? 0) + 1;

  return prisma.quote.create({
    data: {
      number,
      issuingCompany: data.issuingCompany,
      clientName: data.clientName,
      clientContact: data.clientContact || null,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      notes: data.notes || null,
      createdById: data.createdById,
      items: {
        create: data.items.map((item, order) => ({
          productId: item.productId || null,
          productName: item.productName,
          specifications: item.specifications,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          order,
        })),
      },
    },
    include: { items: true },
  });
}

export async function deleteQuote(id: string) {
  await prisma.quote.delete({ where: { id } });
}
