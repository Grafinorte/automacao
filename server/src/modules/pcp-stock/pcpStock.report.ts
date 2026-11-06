import nodemailer from "nodemailer";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { duePeriod, formatDate, formatDateTime, formatPeriod, monthRange, previousPeriod } from "./pcpStock.period";
import { getSettings, parseRecipients, round3 } from "./pcpStock.service";

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COMPANY_LABEL: Record<string, string> = { GRAFINORTE: "Grafinorte", PLUSPACK: "Pluspack" };
const TYPE_LABEL = { ENTRADA: "Entrada", SAIDA: "Saída", AJUSTE: "Ajuste" } as const;

// Nomes e observações são digitados por pessoas: nunca entram crus no HTML
const esc = (v: string | null | undefined) =>
  (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const TH = "padding:8px 10px;background:#f3f3f5;border-bottom:1px solid #dddddd;font-size:11px;color:#555555;text-align:left;white-space:nowrap;";
const TD = "padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:12px;color:#222222;vertical-align:top;";
const RIGHT = "text-align:right;white-space:nowrap;";

const companyName = (company: string) => COMPANY_LABEL[company] ?? company;
const ownerName = (item: { company: string; client: string | null }) => item.client ?? `${companyName(item.company)} (material próprio)`;

export async function buildReport(period: string) {
  const { start, end } = monthRange(period);
  const [items, movements] = await Promise.all([
    prisma.pcpStockItem.findMany({
      where: { createdAt: { lt: end }, OR: [{ active: true }, { movements: { some: { createdAt: { gte: start, lt: end } } } }] },
      include: { movements: { where: { createdAt: { gte: start } }, select: { type: true, quantity: true, createdAt: true } } },
      orderBy: [{ client: "asc" }, { name: "asc" }],
    }),
    prisma.pcpStockMovement.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: { item: { select: { company: true, osNumber: true, client: true, name: true, unit: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rows = items.map((item) => {
    const inPeriod = item.movements.filter((m) => m.createdAt < end);
    const after = item.movements.filter((m) => m.createdAt >= end).reduce((s, m) => s + m.quantity, 0);
    const sum = (type: string) => inPeriod.filter((m) => m.type === type).reduce((s, m) => s + m.quantity, 0);
    return {
      owner: `${companyName(item.company)} · ${item.client ?? "Material próprio"}`,
      osNumber: item.osNumber, name: item.name, category: item.category, unit: item.unit, location: item.location,
      entries: round3(sum("ENTRADA")), exits: round3(0 - sum("SAIDA")), adjustments: round3(sum("AJUSTE")),
      // O saldo é o do último dia do mês, mesmo que o e-mail saia alguns dias depois
      balance: round3(item.quantity - after),
      days: Math.floor((end.getTime() - item.createdAt.getTime()) / DAY_MS),
      moved: inPeriod.length > 0,
    };
    // OS já faturada e sem movimento no mês não precisa aparecer para sempre
  }).filter((r) => r.balance !== 0 || r.moved);

  const owners = [...new Set(rows.map((r) => r.owner))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pending = rows.filter((r) => r.balance > 0).length;
  const lastDay = formatDate(new Date(end.getTime() - 1));
  const exits = movements.filter((m) => m.type === "SAIDA").length;
  const entries = movements.filter((m) => m.type === "ENTRADA").length;

  const stockTables = owners.map((owner) => `
    <p style="margin:20px 0 6px;font-size:14px;font-weight:700;color:#111111;">${esc(owner)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><th style="${TH}">OS</th><th style="${TH}">Material</th><th style="${TH}">Local</th><th style="${TH}${RIGHT}">No estoque</th><th style="${TH}${RIGHT}">Entradas</th><th style="${TH}${RIGHT}">Saídas</th><th style="${TH}${RIGHT}">Saldo</th></tr>
      ${rows.filter((r) => r.owner === owner).map((r) => `<tr>
        <td style="${TD}white-space:nowrap;">${esc(r.osNumber) || "—"}</td><td style="${TD}">${esc(r.name)}<br><span style="font-size:10px;color:#777777;">${esc(r.category)}</span></td><td style="${TD}">${esc(r.location) || "—"}</td>
        <td style="${TD}${RIGHT}">${r.balance > 0 ? `${r.days} ${r.days === 1 ? "dia" : "dias"}` : "—"}</td>
        <td style="${TD}${RIGHT}">${num(r.entries)}</td><td style="${TD}${RIGHT}">${num(r.exits)}</td>
        <td style="${TD}${RIGHT}font-weight:700;">${num(r.balance)} ${esc(r.unit)}${r.adjustments ? `<br><span style="font-size:10px;font-weight:400;color:#777777;">ajuste ${r.adjustments > 0 ? "+" : ""}${num(r.adjustments)}</span>` : ""}</td>
      </tr>`).join("")}
    </table>`).join("");

  const movementRows = movements.map((m) => `<tr>
    <td style="${TD}white-space:nowrap;">${formatDateTime(m.createdAt)}</td>
    <td style="${TD}white-space:nowrap;">${esc(m.item.osNumber) || "—"}</td>
    <td style="${TD}">${esc(m.item.name)}<br><span style="font-size:10px;color:#777777;">${esc(ownerName(m.item))}</span></td>
    <td style="${TD}">${TYPE_LABEL[m.type]}</td>
    <td style="${TD}${RIGHT}font-weight:700;">${m.quantity > 0 ? "+" : ""}${num(m.quantity)} ${esc(m.item.unit)}</td>
    <td style="${TD}${RIGHT}">${num(m.balanceAfter)}</td>
    <td style="${TD}white-space:nowrap;">${esc(m.invoiceNumber) || "—"}</td>
    <td style="${TD}">${esc(m.takenBy) || "—"}</td>
    <td style="${TD}">${esc([m.reference, m.notes].filter(Boolean).join(" · ")) || "—"}</td>
    <td style="${TD}">${esc(m.createdByName)}</td>
  </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 12px;background:#f0f0f2;font-family:Helvetica,Arial,sans-serif;">
<table align="center" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#ffffff;border-radius:10px;"><tr><td style="padding:28px;">
  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#888888;">GRAFINORTE · CONTROLE DE ESTOQUE PCP</p>
  <h1 style="margin:6px 0 4px;font-size:22px;color:#111111;">Relatório de ${esc(formatPeriod(period))}</h1>
  <p style="margin:0;font-size:13px;color:#555555;">${pending} produzidos e não faturados · ${entries} entradas · ${exits} saídas</p>

  <h2 style="margin:26px 0 0;font-size:16px;color:#111111;">Estoque em ${lastDay}</h2>
  ${stockTables || `<p style="font-size:13px;color:#777777;">Nenhum material no estoque.</p>`}

  <h2 style="margin:30px 0 8px;font-size:16px;color:#111111;">Movimentações do mês</h2>
  ${movementRows ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><th style="${TH}">Data</th><th style="${TH}">OS</th><th style="${TH}">Material</th><th style="${TH}">Tipo</th><th style="${TH}${RIGHT}">Qtd.</th><th style="${TH}${RIGHT}">Saldo</th><th style="${TH}">NF</th><th style="${TH}">Quem tirou</th><th style="${TH}">Obs.</th><th style="${TH}">Registrado por</th></tr>
    ${movementRows}</table>` : `<p style="font-size:13px;color:#777777;">Nenhuma movimentação neste mês.</p>`}

  <p style="margin:26px 0 0;font-size:11px;color:#999999;">Enviado automaticamente pela plataforma Grafinorte.</p>
</td></tr></table></body></html>`;

  return { subject: `Estoque PCP: relatório de ${formatPeriod(period)}`, html };
}

function friendlyError(err: unknown) {
  const code = (err as { code?: string })?.code;
  if (code === "EAUTH") return "O Gmail recusou o e-mail ou a senha de app do remetente.";
  if (code === "ESOCKET" || code === "ETIMEDOUT" || code === "ECONNECTION" || code === "EDNS") return "Não consegui conectar ao servidor de e-mail.";
  return "O servidor de e-mail não aceitou o envio.";
}

export async function sendReport(period: string, now = new Date()) {
  const settings = await getSettings();
  const to = parseRecipients(settings.recipients);
  if (!to.length) throw new HttpError(400, "Informe quem recebe o relatório.");
  if (!settings.senderUserId) throw new HttpError(400, "Escolha o e-mail que envia o relatório.");

  const sender = await prisma.user.findUnique({
    where: { id: settings.senderUserId },
    select: { isActive: true, smtpEmail: true, smtpAppPassword: true },
  });
  if (!sender?.isActive || !sender.smtpEmail || !sender.smtpAppPassword) {
    const message = "O remetente escolhido não tem mais e-mail configurado no perfil.";
    await prisma.pcpStockSettings.update({ where: { id: "default" }, data: { lastError: message } });
    throw new HttpError(400, message);
  }

  const { subject, html } = await buildReport(period);
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: sender.smtpEmail, pass: sender.smtpAppPassword },
  });

  try {
    await transporter.sendMail({ from: `"Grafinorte · Estoque PCP" <${sender.smtpEmail}>`, to, subject, html });
  } catch (err) {
    const message = friendlyError(err);
    console.error("[Estoque PCP] Falha ao enviar o relatório:", (err as { code?: string })?.code ?? "sem código");
    await prisma.pcpStockSettings.update({ where: { id: "default" }, data: { lastError: message } });
    throw new HttpError(502, `Relatório não enviado. ${message}`);
  }

  // Reenviar um mês antigo não pode fazer o agendador pular o mês devido
  const dueNow = period === previousPeriod(now);
  return prisma.pcpStockSettings.update({
    where: { id: "default" },
    data: { lastSentAt: new Date(), lastError: null, ...(dueNow ? { lastPeriodSent: period } : {}) },
  });
}

let running = false;

export async function checkMonthlyReport(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const settings = await getSettings();
    const period = duePeriod(now, settings.lastPeriodSent);
    if (!period || !settings.senderUserId || !parseRecipients(settings.recipients).length) return;
    await sendReport(period, now);
    console.log(`[Estoque PCP] Relatório de ${period} enviado.`);
  } catch (err) {
    // Tenta de novo na próxima hora; a tela mostra o último erro
    console.error("[Estoque PCP] Relatório mensal não enviado:", err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    running = false;
  }
}

export function startPcpStockScheduler() {
  setTimeout(() => void checkMonthlyReport(), FIRST_CHECK_MS);
  setInterval(() => void checkMonthlyReport(), CHECK_EVERY_MS);
}
