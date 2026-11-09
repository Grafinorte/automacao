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

const positiveOrNull = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 && v !== null && v !== "" ? round3(Number(v)) : null);

export async function createItem(
  raw: PcpItemInput & { quantity?: unknown; stage?: unknown; orderedQty?: unknown; plannedQty?: unknown },
  userId: string,
) {
  const data = cleanItem(raw);
  // Começa em produção (sem saldo) ou já direto no estoque, para o que já estava pronto
  const inProduction = raw.stage === "PRODUCAO";
  const quantity = inProduction || raw.quantity === undefined || raw.quantity === null || raw.quantity === "" ? 0 : Number(raw.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, "Quantidade inicial inválida.");
  await assertNotDuplicate(data.company, data.osNumber, data.name);
  const createdByName = await userName(userId);
  const initial = round3(quantity);
  const now = new Date();
  const flow = {
    stage: inProduction ? "PRODUCAO" : "ESTOQUE",
    stageAt: now,
    stageBy: createdByName,
    stockedAt: inProduction ? null : now,
    orderedQty: positiveOrNull(raw.orderedQty),
    plannedQty: positiveOrNull(raw.plannedQty),
  };

  return prisma.$transaction(async (tx) => {
    const item = await tx.pcpStockItem.create({ data: { ...data, ...flow, quantity: initial } });
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
/**
 * Sem saída com nota, foi lançamento por engano: apaga de vez, com as entradas.
 * Com nota, o histórico precisa ficar: só sai da lista, e com o saldo zerado.
 */
export async function removeItem(id: string): Promise<"deleted" | "archived"> {
  const item = await prisma.pcpStockItem.findUnique({ where: { id } });
  if (!item?.active) throw new HttpError(404, "Material não encontrado.");
  const exits = await prisma.pcpStockMovement.count({ where: { itemId: id, type: "SAIDA" } });
  if (exits === 0) {
    await prisma.$transaction([
      prisma.pcpStockMovement.deleteMany({ where: { itemId: id } }),
      prisma.pcpStockItem.delete({ where: { id } }),
    ]);
    return "deleted";
  }
  if (item.quantity !== 0) {
    throw new HttpError(409, `Esta OS já teve saída com nota e ainda tem ${item.quantity} ${item.unit}. Zere o saldo com um ajuste antes de excluir.`);
  }
  await prisma.pcpStockItem.update({ where: { id }, data: { active: false } });
  return "archived";
}

export async function addMovement(
  itemId: string,
  userId: string,
  raw: { type?: unknown; quantity?: unknown; takenBy?: unknown; reference?: unknown; invoiceNumber?: unknown; notes?: unknown; noDispatch?: unknown },
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
    if (item.stage !== "ESTOQUE") throw new HttpError(409, "Esta OS ainda não entrou no estoque. Conclua a produção e a conferência da expedição antes.");

    // No ajuste, a quantidade informada é o saldo contado
    const delta = round3(type === "ENTRADA" ? quantity : type === "SAIDA" ? -quantity : quantity - item.quantity);
    const balanceAfter = round3(item.quantity + delta);
    if (balanceAfter < 0) throw new HttpError(400, `Estoque insuficiente. Disponível: ${item.quantity} ${item.unit}.`);
    if (delta === 0) throw new HttpError(400, "O saldo contado é igual ao saldo atual.");

    const movement = await tx.pcpStockMovement.create({
      data: {
        itemId, type, quantity: delta, balanceAfter,
        takenBy: type === "SAIDA" ? takenBy : null, invoiceNumber: type === "SAIDA" ? invoiceNumber : null,
        ...(type === "SAIDA" && raw.noDispatch === true ? noDispatchMark(createdByName) : {}),
        reference, notes, createdById: userId, createdByName,
      },
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

// ─── Fluxo do desenho do PCP: Produção → Expedição → Estoque → NF → Despacho ──
const STAGE_MOVES: Record<string, string> = { "PRODUCAO>EXPEDICAO": "produção concluída", "EXPEDICAO>PRODUCAO": "voltou para a produção" };

/** Produção concluída (ou volta, se marcaram por engano). A entrada no estoque é pela conferência. */
export async function moveStage(id: string, userId: string, to: unknown) {
  const item = await prisma.pcpStockItem.findUnique({ where: { id } });
  if (!item?.active) throw new HttpError(404, "OS não encontrada.");
  if (typeof to !== "string" || !STAGE_MOVES[`${item.stage}>${to}`]) throw new HttpError(409, "Essa mudança de etapa não é permitida.");
  return prisma.pcpStockItem.update({ where: { id }, data: { stage: to, stageAt: new Date(), stageBy: await userName(userId) } });
}

/** A expedição confere a quantidade e a OS entra no estoque */
export async function receiveItem(id: string, userId: string, raw: { quantity?: unknown; notes?: unknown }) {
  const quantity = round3(Number(raw.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, "Informe a quantidade conferida.");
  const createdByName = await userName(userId);

  return prisma.$transaction(async (tx) => {
    const item = await tx.pcpStockItem.findUnique({ where: { id } });
    if (!item?.active) throw new HttpError(404, "OS não encontrada.");
    if (item.stage !== "EXPEDICAO") throw new HttpError(409, "Só entra no estoque o que está na expedição.");
    const balanceAfter = round3(item.quantity + quantity);
    const now = new Date();
    await tx.pcpStockMovement.create({
      data: { itemId: id, type: "ENTRADA", quantity, balanceAfter, notes: clean(raw.notes), createdById: userId, createdByName },
    });
    return tx.pcpStockItem.update({
      where: { id },
      data: { quantity: balanceAfter, stage: "ESTOQUE", stageAt: now, stageBy: createdByName, stockedAt: now },
    });
  });
}

/** Cliente retira ou não há entrega: a nota não fica parada em "A despachar" */
const NO_DISPATCH = "sem despacho";
function noDispatchMark(userName: string) {
  return { dispatchedAt: new Date(), dispatchedBy: `${userName} (${NO_DISPATCH})` };
}

const MAX_INVOICE_LINES = 100;

/**
 * Uma nota com várias OS do mesmo cliente: uma saída por OS, com o mesmo número de nota.
 * Tudo numa transação: se uma OS falhar, nenhuma saída é gravada.
 */
export async function invoiceItems(userId: string, raw: {
  invoiceNumber?: unknown; takenBy?: unknown; notes?: unknown; noDispatch?: unknown; lines?: unknown;
}) {
  const invoiceNumber = clean(raw.invoiceNumber);
  const takenBy = clean(raw.takenBy);
  const notes = clean(raw.notes);
  if (!invoiceNumber) throw new HttpError(400, "Informe o número da nota fiscal.");
  if (!takenBy) throw new HttpError(400, "Informe quem tirou do estoque.");
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) throw new HttpError(400, "Escolha pelo menos uma OS.");
  if (raw.lines.length > MAX_INVOICE_LINES) throw new HttpError(400, `No máximo ${MAX_INVOICE_LINES} OS por nota.`);

  const lines = raw.lines.map((l) => {
    const line = l as { itemId?: unknown; quantity?: unknown };
    const quantity = round3(Number(line.quantity));
    if (typeof line.itemId !== "string" || !Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, "Quantidade inválida em uma das OS.");
    return { itemId: line.itemId, quantity };
  });
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length) throw new HttpError(400, "A mesma OS apareceu duas vezes.");

  const createdByName = await userName(userId);
  const dispatch = raw.noDispatch === true ? noDispatchMark(createdByName) : {};

  return prisma.$transaction(async (tx) => {
    const items = await tx.pcpStockItem.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } });
    if (items.length !== lines.length || items.some((i) => !i.active)) throw new HttpError(404, "Uma das OS não foi encontrada.");
    // Uma nota é de uma empresa para um cliente
    const owners = new Set(items.map((i) => `${i.company}|${i.client ?? ""}`));
    if (owners.size > 1) throw new HttpError(400, "Uma nota não pode misturar clientes ou empresas diferentes.");

    const created = [];
    for (const line of lines) {
      const item = items.find((i) => i.id === line.itemId)!;
      const label = `OS ${item.osNumber ?? "sem número"}`;
      if (item.stage !== "ESTOQUE") throw new HttpError(409, `${label} ainda não entrou no estoque.`);
      if (line.quantity > item.quantity) throw new HttpError(400, `${label}: estoque insuficiente. Disponível: ${item.quantity} ${item.unit}.`);
      const balanceAfter = round3(item.quantity - line.quantity);
      created.push(await tx.pcpStockMovement.create({
        data: {
          itemId: item.id, type: "SAIDA", quantity: -line.quantity, balanceAfter,
          invoiceNumber, takenBy, notes, createdById: userId, createdByName, ...dispatch,
        },
      }));
      await tx.pcpStockItem.update({ where: { id: item.id }, data: { quantity: balanceAfter } });
    }
    return { invoiceNumber, movements: created.length };
  });
}

const DISPATCHED_DAYS = 7;
const movementItem = { item: { select: { id: true, company: true, osNumber: true, client: true, name: true, unit: true, category: true } } } as const;

/** Faturado esperando despacho e o que foi despachado nos últimos dias */
export async function listDispatch() {
  const since = new Date(Date.now() - DISPATCHED_DAYS * 24 * 60 * 60 * 1000);
  const [pending, done] = await Promise.all([
    prisma.pcpStockMovement.findMany({ where: { type: "SAIDA", dispatchedAt: null }, include: movementItem, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.pcpStockMovement.findMany({ where: { type: "SAIDA", dispatchedAt: { gte: since } }, include: movementItem, orderBy: { dispatchedAt: "desc" }, take: 200 }),
  ]);
  return { pending, done };
}

export async function dispatchMovement(id: string, userId: string) {
  const movement = await prisma.pcpStockMovement.findUnique({ where: { id } });
  if (!movement || movement.type !== "SAIDA") throw new HttpError(404, "Saída não encontrada.");
  if (movement.dispatchedAt) throw new HttpError(409, "Esta nota já foi despachada.");
  return prisma.pcpStockMovement.update({ where: { id }, data: { dispatchedAt: new Date(), dispatchedBy: await userName(userId) } });
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
