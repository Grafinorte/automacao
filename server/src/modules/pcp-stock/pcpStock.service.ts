import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { monthRange, previousPeriod } from "./pcpStock.period";

type PcpMovementType = "ENTRADA" | "SAIDA" | "AJUSTE";

const COMPANIES = ["GRAFINORTE", "PLUSPACK"];

export interface PcpItemInput {
  company?: string;
  osNumber?: string | null;
  client?: string | null;
  name?: string;
  category?: string;
  unit?: string;
  location?: string | null;
  notes?: string | null;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function cleanItem(raw: PcpItemInput) {
  const name = clean(raw.name);
  const category = clean(raw.category);
  const unit = clean(raw.unit);
  const osNumber = clean(raw.osNumber);
  const company = clean(raw.company);
  if (!company || !COMPANIES.includes(company)) throw new HttpError(400, "Escolha a empresa.");
  if (!osNumber) throw new HttpError(400, "Informe o número da OS.");
  if (!name) throw new HttpError(400, "Informe o nome do material.");
  if (!category) throw new HttpError(400, "Informe o tipo do material.");
  if (!unit) throw new HttpError(400, "Informe a unidade.");
  return { company, osNumber, client: clean(raw.client), name, category, unit, location: clean(raw.location), notes: clean(raw.notes) };
}

async function assertNotDuplicate(company: string, osNumber: string, name: string, exceptId?: string) {
  const same = await prisma.pcpStockItem.findFirst({ where: { company, osNumber, name, active: true, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (same) throw new HttpError(409, "Esta OS já tem esse material no estoque. Use Entrada na linha dela para somar.");
}

async function userName(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? "Usuário";
}

export function listItems() {
  // O que está parado há mais tempo aparece primeiro
  return prisma.pcpStockItem.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

export async function createItem(raw: PcpItemInput & { quantity?: unknown }, userId: string) {
  const data = cleanItem(raw);
  const quantity = raw.quantity === undefined || raw.quantity === null || raw.quantity === "" ? 0 : Number(raw.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, "Quantidade inicial inválida.");
  await assertNotDuplicate(data.company, data.osNumber, data.name);
  const createdByName = await userName(userId);
  const initial = round3(quantity);

  return prisma.$transaction(async (tx) => {
    const item = await tx.pcpStockItem.create({ data: { ...data, quantity: initial } });
    if (initial > 0) {
      await tx.pcpStockMovement.create({
        data: { itemId: item.id, type: "ENTRADA", quantity: initial, balanceAfter: initial, createdById: userId, createdByName },
      });
    }
    return item;
  });
}

export async function updateItem(id: string, raw: PcpItemInput) {
  const current = await prisma.pcpStockItem.findUnique({ where: { id } });
  if (!current?.active) throw new HttpError(404, "Material não encontrado.");
  const data = cleanItem(raw);
  await assertNotDuplicate(data.company, data.osNumber, data.name, id);
  return prisma.pcpStockItem.update({ where: { id }, data });
}

/** Arquiva em vez de apagar: as movimentações continuam nos relatórios */
export async function archiveItem(id: string) {
  const item = await prisma.pcpStockItem.findUnique({ where: { id } });
  if (!item?.active) throw new HttpError(404, "Material não encontrado.");
  if (item.quantity !== 0) throw new HttpError(409, `Este material ainda tem ${item.quantity} ${item.unit} no estoque. Zere o saldo antes de arquivar.`);
  await prisma.pcpStockItem.update({ where: { id }, data: { active: false } });
}

export async function addMovement(
  itemId: string,
  userId: string,
  raw: { type?: unknown; quantity?: unknown; takenBy?: unknown; reference?: unknown; invoiceNumber?: unknown; notes?: unknown },
) {
  const type = raw.type as PcpMovementType;
  if (!["ENTRADA", "SAIDA", "AJUSTE"].includes(type)) throw new HttpError(400, "Tipo de movimentação inválido.");
  const quantity = round3(Number(raw.quantity));
  const takenBy = clean(raw.takenBy);
  const reference = clean(raw.reference);
  const invoiceNumber = clean(raw.invoiceNumber);
  const notes = clean(raw.notes);

  if (!Number.isFinite(quantity) || quantity < 0 || (type !== "AJUSTE" && quantity === 0)) throw new HttpError(400, "Quantidade inválida.");
  if (type === "SAIDA" && !invoiceNumber) throw new HttpError(400, "Informe o número da nota fiscal.");
  if (type === "SAIDA" && !takenBy) throw new HttpError(400, "Informe quem tirou do estoque.");
  if (type === "AJUSTE" && !notes) throw new HttpError(400, "Informe o motivo do ajuste.");

  const createdByName = await userName(userId);

  return prisma.$transaction(async (tx) => {
    const item = await tx.pcpStockItem.findUnique({ where: { id: itemId } });
    if (!item?.active) throw new HttpError(404, "Material não encontrado.");

    // No ajuste, a quantidade informada é o saldo contado
    const delta = round3(type === "ENTRADA" ? quantity : type === "SAIDA" ? -quantity : quantity - item.quantity);
    const balanceAfter = round3(item.quantity + delta);
    if (balanceAfter < 0) throw new HttpError(400, `Estoque insuficiente. Disponível: ${item.quantity} ${item.unit}.`);
    if (delta === 0) throw new HttpError(400, "O saldo contado é igual ao saldo atual.");

    const movement = await tx.pcpStockMovement.create({
      data: { itemId, type, quantity: delta, balanceAfter, takenBy: type === "SAIDA" ? takenBy : null, invoiceNumber: type === "SAIDA" ? invoiceNumber : null, reference, notes, createdById: userId, createdByName },
    });
    const updated = await tx.pcpStockItem.update({ where: { id: itemId }, data: { quantity: balanceAfter } });
    return { movement, item: updated };
  });
}

export function listMovements(period: string) {
  const { start, end } = monthRange(period);
  return prisma.pcpStockMovement.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { item: { select: { id: true, company: true, osNumber: true, client: true, name: true, unit: true, category: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function parseRecipients(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Começa marcando o mês anterior como resolvido: quem liga em novembro não recebe um outubro vazio */
export function getSettings() {
  return prisma.pcpStockSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", lastPeriodSent: previousPeriod(new Date()) },
  });
}

export function listSenders() {
  return prisma.user.findMany({
    where: { isActive: true, smtpEmail: { not: null }, smtpAppPassword: { not: null } },
    select: { id: true, name: true, smtpEmail: true },
    orderBy: { name: "asc" },
  });
}

export async function updateSettings(raw: { recipients?: unknown; senderUserId?: unknown }) {
  const list = parseRecipients(typeof raw.recipients === "string" ? raw.recipients : "");
  const invalid = list.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) throw new HttpError(400, `E-mail inválido: ${invalid.join(", ")}`);
  if (list.length > 20) throw new HttpError(400, "Informe no máximo 20 destinatários.");

  const senderUserId = clean(raw.senderUserId);
  if (senderUserId && !(await listSenders()).some((u) => u.id === senderUserId)) {
    throw new HttpError(400, "Este usuário não tem e-mail configurado no perfil.");
  }

  await getSettings();
  return prisma.pcpStockSettings.update({ where: { id: "default" }, data: { recipients: list.join(", "), senderUserId, lastError: null } });
}
