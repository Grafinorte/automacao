import { prisma } from "../../db/prisma";

// ─── Seed data (run once if tables are empty) ─────────────────────────────────

const DEFAULT_PARAMETERS = [
  { key: "custo_fixo_total",      label: "Custo Fixo Total Mensal",          value: 889135.68, category: "financeiro",   unit: "R$" },
  { key: "volume_os_mes",         label: "Volume Médio de OSs/mês",           value: 517,       category: "operacional",  unit: "OSs" },
  { key: "rateio_fixo_por_os",    label: "Rateio Fixo por OS",                value: 1719.80,   category: "financeiro",   unit: "R$" },
  { key: "margem_contribuicao",   label: "Margem de Contribuição Real",        value: 23.1,      category: "financeiro",   unit: "%" },
  { key: "margem_meta",           label: "Margem de Contribuição Meta",        value: 30.0,      category: "meta",         unit: "%" },
  { key: "ponto_equilibrio",      label: "Ponto de Equilíbrio Mensal",         value: 3849560.15,category: "financeiro",   unit: "R$" },
  { key: "ticket_medio_alvo",     label: "Ticket Médio Alvo por OS",           value: 4000.0,    category: "meta",         unit: "R$" },
  { key: "taxa_conversao_meta",   label: "Taxa de Conversão de Orçamentos",    value: 35.0,      category: "meta",         unit: "%" },
  { key: "salarios_encargos",     label: "Salários + Encargos Mensais",        value: 542502.0,  category: "financeiro",   unit: "R$" },
  { key: "depreciacao_total",     label: "Depreciação Mensal Total",           value: 61862.24,  category: "financeiro",   unit: "R$" },
  { key: "despesas_fixas_adm",    label: "Despesas Fixas Administrativas",     value: 196875.01, category: "financeiro",   unit: "R$" },
  { key: "ticket_medio_real",     label: "Ticket Médio Real por OS (Jun/26)",  value: 3560.0,    category: "operacional",  unit: "R$" },
];

const DEFAULT_MACHINE_RATES = [
  { code: "201", name: "Arte Final / Pré-impressão",   sector: "PRE_IMPRESSAO", rateApril: 5.02,   rateMay: 3.39,   rateJune: 14.26,  rateConsolidated: 5.52,   bufferPct: 5,  rateWithBuffer: 5.80,   status: "INCONSISTENTE" },
  { code: "202", name: "Montagem e Gravação",           sector: "PRE_IMPRESSAO", rateApril: 394.46, rateMay: 396.88, rateJune: 367.22, rateConsolidated: 385.70, bufferPct: 20, rateWithBuffer: 462.84, status: "REVISAR" },
  { code: "301", name: "Impressoras Rotativas",         sector: "IMPRESSAO",     rateApril: 503.31, rateMay: 506.03, rateJune: 507.26, rateConsolidated: 505.32, bufferPct: 5,  rateWithBuffer: 530.59, status: "ESTAVEL" },
  { code: "303", name: "Impressora Plana - SM - F2",   sector: "IMPRESSAO",     rateApril: 298.19, rateMay: 305.21, rateJune: 306.13, rateConsolidated: 303.09, bufferPct: 15, rateWithBuffer: 348.56, status: "ESTAVEL" },
  { code: "308", name: "Digital",                       sector: "IMPRESSAO",     rateApril: 100.56, rateMay: 102.13, rateJune: 103.38, rateConsolidated: 102.21, bufferPct: 25, rateWithBuffer: 127.77, status: "REVISAR" },
  { code: "309", name: "Impressora Plana Komori F1",   sector: "IMPRESSAO",     rateApril: 467.02, rateMay: 469.18, rateJune: 471.47, rateConsolidated: 469.37, bufferPct: 15, rateWithBuffer: 539.77, status: "ESTAVEL" },
  { code: "310", name: "Comunicação Visual",            sector: "IMPRESSAO",     rateApril: null,   rateMay: null,   rateJune: 73.61,  rateConsolidated: 73.61,  bufferPct: 5,  rateWithBuffer: 77.29,  status: "ESTAVEL" },
  { code: "401", name: "Guilhotina",                    sector: "ACABAMENTO",    rateApril: 102.14, rateMay: 102.65, rateJune: 103.34, rateConsolidated: 102.73, bufferPct: 5,  rateWithBuffer: 107.87, status: "ESTAVEL" },
  { code: "402", name: "Acabamento Manual",             sector: "ACABAMENTO",    rateApril: 58.40,  rateMay: 69.06,  rateJune: 69.71,  rateConsolidated: 64.91,  bufferPct: 15, rateWithBuffer: 74.65,  status: "REVISAR" },
  { code: "403", name: "Alceadeira",                    sector: "ACABAMENTO",    rateApril: 132.13, rateMay: 132.76, rateJune: 132.37, rateConsolidated: 132.40, bufferPct: 5,  rateWithBuffer: 139.02, status: "ESTAVEL" },
  { code: "404", name: "Dobradeira",                    sector: "ACABAMENTO",    rateApril: 99.39,  rateMay: 100.13, rateJune: 100.22, rateConsolidated: 99.87,  bufferPct: 5,  rateWithBuffer: 104.86, status: "ESTAVEL" },
  { code: "406", name: "Resmadeira / Rebobinadeira",   sector: "ACABAMENTO",    rateApril: 121.47, rateMay: 125.65, rateJune: 126.04, rateConsolidated: 122.73, bufferPct: 5,  rateWithBuffer: 128.86, status: "ESTAVEL" },
  { code: "408", name: "Máquina de Copo/Pote",         sector: "ACABAMENTO",    rateApril: 129.04, rateMay: 129.24, rateJune: 130.53, rateConsolidated: 129.49, bufferPct: 5,  rateWithBuffer: 135.96, status: "ESTAVEL" },
  { code: "409", name: "Corte e Vinco Automática",     sector: "ACABAMENTO",    rateApril: 138.54, rateMay: 118.81, rateJune: 163.07, rateConsolidated: 137.88, bufferPct: 15, rateWithBuffer: 158.56, status: "REVISAR" },
  { code: "411", name: "Acabamento Máquina",            sector: "ACABAMENTO",    rateApril: 170.36, rateMay: 176.62, rateJune: 185.21, rateConsolidated: 180.85, bufferPct: 20, rateWithBuffer: 217.02, status: "REVISAR" },
  { code: "412", name: "Cartucheira ZH1000",            sector: "ACABAMENTO",    rateApril: 137.31, rateMay: 138.50, rateJune: 140.13, rateConsolidated: 138.85, bufferPct: 5,  rateWithBuffer: 145.79, status: "ESTAVEL" },
];

const DEFAULT_FIXED_COSTS = [
  { name: "Energia Elétrica",            amount: 38000.00,  category: "estrutura",   rateioPerOs: 73.50,  order: 1 },
  { name: "Pró-labore",                  amount: 23515.00,  category: "gestao",      rateioPerOs: 45.48,  order: 2 },
  { name: "Contratos Mensais",           amount: 14000.00,  category: "estrutura",   rateioPerOs: 27.08,  order: 3 },
  { name: "Consultorias",                amount: 13500.00,  category: "gestao",      rateioPerOs: 26.11,  order: 4 },
  { name: "Embalagem",                   amount: 12700.00,  category: "operacional", rateioPerOs: 24.56,  order: 5 },
  { name: "Marketing / Propaganda",      amount: 10000.00,  category: "comercial",   rateioPerOs: 19.34,  order: 6 },
  { name: "Combustíveis",                amount: 9500.00,   category: "logistica",   rateioPerOs: 18.38,  order: 7 },
  { name: "Segurança Patrimonial",       amount: 8000.00,   category: "estrutura",   rateioPerOs: 15.47,  order: 8 },
  { name: "Horas Extras",               amount: 8000.00,   category: "operacional", rateioPerOs: 15.47,  order: 9 },
  { name: "Manutenção Veículos",        amount: 6800.00,   category: "logistica",   rateioPerOs: 13.15,  order: 10 },
  { name: "Fretes e Carretos",          amount: 7000.00,   category: "logistica",   rateioPerOs: 13.54,  order: 11 },
  { name: "Alimentação",                amount: 4200.00,   category: "pessoal",     rateioPerOs: 8.12,   order: 12 },
  { name: "Viagens",                    amount: 5000.00,   category: "comercial",   rateioPerOs: 9.67,   order: 13 },
  { name: "Manutenção Predial",         amount: 15500.00,  category: "estrutura",   rateioPerOs: 29.98,  order: 14 },
  { name: "Outros (EPIs, Mat. etc.)",   amount: 10175.01,  category: "estrutura",   rateioPerOs: 19.68,  order: 15 },
];

const DEFAULT_DEVIATIONS = [
  { sectorCode: "308", sectorName: "Digital",              deviationApril: 2629,    deviationMay: 10237,  deviationJune: 6346,    trend: "PIORANDO",   priority: "CRITICO" },
  { sectorCode: "202", sectorName: "Montagem / Gravação",  deviationApril: 10080,   deviationMay: 12669,  deviationJune: 17674,   trend: "PIORANDO",   priority: "ACELERANDO" },
  { sectorCode: "411", sectorName: "Acabamento Máquina",   deviationApril: 442,     deviationMay: 6046,   deviationJune: 5730,    trend: "PIORANDO",   priority: "CRITICO" },
  { sectorCode: "409", sectorName: "Corte e Vinco",        deviationApril: 1697,    deviationMay: 3331,   deviationJune: 3722,    trend: "PIORANDO",   priority: "CRESCENTE" },
  { sectorCode: "402", sectorName: "Acabamento Manual",    deviationApril: 1900,    deviationMay: 4427,   deviationJune: 2744,    trend: "PIORANDO",   priority: "CRITICO" },
  { sectorCode: "309", sectorName: "Komori F1",            deviationApril: 5450,    deviationMay: -684,   deviationJune: 13853,   trend: "PIORANDO",   priority: "INSTAVEL" },
  { sectorCode: "303", sectorName: "Impressora SM",        deviationApril: -1057,   deviationMay: 711,    deviationJune: 7031,    trend: "PIORANDO",   priority: "CRESCENTE" },
  { sectorCode: "301", sectorName: "Rot. Goss",            deviationApril: -9007,   deviationMay: -11540, deviationJune: -17009,  trend: "MELHORANDO", priority: "EFICIENTE" },
  { sectorCode: "408", sectorName: "Copo/Pote",            deviationApril: 14,      deviationMay: 251,    deviationJune: -19395,  trend: "MELHORANDO", priority: "EFICIENTE" },
];

async function seedIfEmpty() {
  const count = await prisma.rkwParameter.count();
  if (count > 0) return;

  await prisma.$transaction([
    ...DEFAULT_PARAMETERS.map((p) => prisma.rkwParameter.create({ data: p })),
    ...DEFAULT_MACHINE_RATES.map((m) => prisma.rkwMachineRate.create({ data: m })),
    ...DEFAULT_FIXED_COSTS.map((c) => prisma.rkwFixedCost.create({ data: c })),
    ...DEFAULT_DEVIATIONS.map((d) => prisma.rkwDeviation.create({ data: d })),
  ]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getRkwData() {
  await seedIfEmpty();
  const [parameters, machineRates, fixedCosts, deviations] = await Promise.all([
    prisma.rkwParameter.findMany({ orderBy: { category: "asc" } }),
    prisma.rkwMachineRate.findMany({ orderBy: { code: "asc" } }),
    prisma.rkwFixedCost.findMany({ orderBy: { order: "asc" } }),
    prisma.rkwDeviation.findMany({ orderBy: { sectorCode: "asc" } }),
  ]);
  return { parameters, machineRates, fixedCosts, deviations };
}

export async function updateParameter(key: string, value: number) {
  return prisma.rkwParameter.update({ where: { key }, data: { value } });
}

export async function updateMachineRate(
  id: string,
  data: { rateConsolidated?: number; bufferPct?: number; status?: string }
) {
  const existing = await prisma.rkwMachineRate.findUnique({ where: { id } });
  if (!existing) throw new Error("Máquina não encontrada");
  const consolidated = data.rateConsolidated ?? existing.rateConsolidated;
  const buffer = data.bufferPct ?? existing.bufferPct;
  const rateWithBuffer = Math.round(consolidated * (1 + buffer / 100) * 100) / 100;
  return prisma.rkwMachineRate.update({
    where: { id },
    data: { ...data, rateConsolidated: consolidated, bufferPct: buffer, rateWithBuffer },
  });
}

export async function updateFixedCost(id: string, amount: number) {
  const item = await prisma.rkwFixedCost.findUnique({ where: { id } });
  if (!item) throw new Error("Custo não encontrado");
  // recalculate rateio based on current OS volume
  const osParam = await prisma.rkwParameter.findUnique({ where: { key: "volume_os_mes" } });
  const osVol = osParam?.value ?? 517;
  const rateioPerOs = Math.round((amount / osVol) * 100) / 100;
  return prisma.rkwFixedCost.update({ where: { id }, data: { amount, rateioPerOs } });
}
