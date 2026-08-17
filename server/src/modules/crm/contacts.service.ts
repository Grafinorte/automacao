import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

export function listContacts() {
  return prisma.contact.findMany({ orderBy: { name: "asc" } });
}

export function getContact(id: string) {
  return prisma.contact.findUniqueOrThrow({
    where: { id },
    include: {
      deals: {
        include: { stage: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export function createContact(data: {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}) {
  return prisma.contact.create({ data });
}

export function updateContact(
  id: string,
  data: { name?: string; company?: string | null; email?: string | null; phone?: string | null; notes?: string | null }
) {
  return prisma.contact.update({ where: { id }, data });
}

export async function deleteContact(id: string) {
  const dealCount = await prisma.deal.count({ where: { contactId: id } });
  if (dealCount > 0) {
    throw new HttpError(
      400,
      "Não é possível excluir um contato com negócios associados. Exclua os negócios primeiro."
    );
  }
  await prisma.contact.delete({ where: { id } });
}

export interface ContactImportRow {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

function normalize(value?: string | null) {
  return value ? value.trim().toLowerCase() : "";
}

export async function importContacts(rows: ContactImportRow[]) {
  const existing = await prisma.contact.findMany({
    select: { email: true, phone: true },
  });
  const existingEmails = new Set(existing.map((c) => normalize(c.email)).filter(Boolean));
  const existingPhones = new Set(existing.map((c) => normalize(c.phone)).filter(Boolean));

  const toCreate: ContactImportRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (!row.name || !row.name.trim()) {
      skipped++;
      continue;
    }
    const email = normalize(row.email);
    const phone = normalize(row.phone);
    const isDuplicate = (email && existingEmails.has(email)) || (phone && existingPhones.has(phone));
    if (isDuplicate) {
      skipped++;
      continue;
    }
    if (email) existingEmails.add(email);
    if (phone) existingPhones.add(phone);
    toCreate.push(row);
  }

  if (toCreate.length > 0) {
    await prisma.contact.createMany({
      data: toCreate.map((row) => ({
        name: row.name.trim(),
        company: row.company?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        notes: row.notes?.trim() || null,
      })),
    });
  }

  return { created: toCreate.length, skipped };
}
