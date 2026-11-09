import { prisma } from "../../db/prisma";
import { FUNCTION_DECLARATIONS as CRM_DECLARATIONS, executeTool as executeCrmTool } from "../crm/crm-agent.service";
import { canAccessStock } from "../pcp-stock/pcpStock.controller";
import { monthRange, isPeriod, currentPeriod } from "../pcp-stock/pcpStock.period";

/**
 * Consultas que a Luma pode fazer nos dados da plataforma. Só leitura.
 * Cada área só é oferecida a quem tem acesso a ela, com a mesma regra das telas.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 40;
const COMPANY = { GRAFINORTE: "Grafinorte", PLUSPACK: "Pluspack" } as Record<string, string>;
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const days = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
const owner = (i: { company: string; client: string | null }) => i.client ?? `${COMPANY[i.company] ?? i.company} (material próprio)`;

export interface Declaration { name: string; description: string; parameters?: Record<string, unknown> }
interface Area { label: string; declarations: Declaration[]; run: (name: string, args: Record<string, unknown>) => Promise<unknown> }

// ─── Estoque PCP ──────────────────────────────────────────────────────────────
const STOCK: Area = {
  label: "Estoque PCP",
  declarations: [
    {
      name: "estoque_resumo",
      description: "Resumo do Estoque PCP: quantas OS em produção, na expedição, no estoque e notas a despachar; e as OS paradas no estoque há mais tempo.",
    },
    {
      name: "estoque_por_cliente",
      description: "Saldo no estoque de produto acabado de um cliente (ou de todos, se vazio): OS, material, saldo, há quantos dias está parada e local.",
      parameters: { type: "OBJECT", properties: { cliente: { type: "STRING", description: "Nome ou parte do nome do cliente ou do material; vazio para todos" } } },
    },
    {
      name: "estoque_historico",
      description: "Movimentações de uma OS ou de uma nota fiscal: entradas, saídas com nota, ajustes e despachos, com quem fez e quando.",
      parameters: { type: "OBJECT", properties: { os: { type: "STRING", description: "Número da OS" }, nota: { type: "STRING", description: "Número da nota fiscal" } } },
    },
  ],
  async run(name, args) {
    if (name === "estoque_resumo") {
      const [items, pending] = await Promise.all([
        prisma.pcpStockItem.findMany({ where: { active: true } }),
        prisma.pcpStockMovement.count({ where: { type: "SAIDA", dispatchedAt: null } }),
      ]);
      const inStock = items.filter((i) => i.stage === "ESTOQUE" && i.quantity > 0)
        .map((i) => ({ os: i.osNumber, material: i.name, dono: owner(i), saldo: `${i.quantity} ${i.unit}`, dias_parada: days(i.stockedAt ?? i.createdAt) }))
        .sort((a, b) => b.dias_parada - a.dias_parada);
      return {
        em_producao: items.filter((i) => i.stage === "PRODUCAO").length,
        na_expedicao: items.filter((i) => i.stage === "EXPEDICAO").length,
        os_com_saldo_no_estoque: inStock.length,
        paradas_ha_mais_de_30_dias: inStock.filter((i) => i.dias_parada > 30).length,
        notas_a_despachar: pending,
        mais_antigas: inStock.slice(0, 10),
      };
    }
    if (name === "estoque_por_cliente") {
      const needle = normalize(String(args.cliente ?? "").trim());
      const items = await prisma.pcpStockItem.findMany({ where: { active: true, stage: "ESTOQUE", quantity: { gt: 0 } }, orderBy: { createdAt: "asc" } });
      const rows = items.filter((i) => !needle || normalize(`${owner(i)} ${i.name} ${i.osNumber ?? ""}`).includes(needle));
      return {
        encontradas: rows.length,
        os: rows.slice(0, MAX_ROWS).map((i) => ({
          os: i.osNumber, empresa: COMPANY[i.company] ?? i.company, dono: owner(i), material: i.name,
          saldo: i.quantity, unidade: i.unit, dias_parada: days(i.stockedAt ?? i.createdAt), local: i.location,
        })),
        observacao: rows.length > MAX_ROWS ? `Mostrando ${MAX_ROWS} de ${rows.length}.` : undefined,
      };
    }
    if (name === "estoque_historico") {
      const os = String(args.os ?? "").trim();
      const nota = String(args.nota ?? "").trim();
      if (!os && !nota) return { erro: "Informe o número da OS ou da nota." };
      const movements = await prisma.pcpStockMovement.findMany({
        where: nota ? { invoiceNumber: { contains: nota } } : { item: { osNumber: os } },
        include: { item: { select: { osNumber: true, name: true, client: true, company: true, unit: true } }, dispatches: true },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
      });
      return {
        encontradas: movements.length,
        movimentacoes: movements.map((m) => ({
          data: m.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          os: m.item.osNumber, material: m.item.name, dono: owner(m.item), tipo: m.type, quantidade: m.quantity, saldo_depois: m.balanceAfter,
          nota: m.invoiceNumber, quem_tirou: m.takenBy, registrado_por: m.createdByName, obs: m.notes,
          despachos: m.dispatches.map((d) => ({ quantidade: d.quantity, quando: d.dispatchedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), por: d.dispatchedBy, obs: d.notes })),
        })),
      };
    }
    return { erro: `Consulta desconhecida: ${name}` };
  },
};

// ─── Teste de cor (qualquer usuário logado, como a tela) ─────────────────────
const COLOR_PROOF: Area = {
  label: "Teste de cor",
  declarations: [{
    name: "teste_cor_mes",
    description: "Custo das provas de cor de um mês: quantidade de provas, papel (m²), tinta (ml) e custo total.",
    parameters: { type: "OBJECT", properties: { mes: { type: "STRING", description: "Mês no formato AAAA-MM; vazio para o mês atual" } } },
  }],
  async run(_name, args) {
    const period = isPeriod(args.mes) ? String(args.mes) : currentPeriod(new Date());
    const { start, end } = monthRange(period);
    const proofs = await prisma.colorProof.findMany({ where: { date: { gte: start, lt: end } }, select: { paperM2: true, inkMl: true, totalCost: true } });
    const sum = (k: "paperM2" | "inkMl" | "totalCost") => Math.round(proofs.reduce((s, p) => s + p[k], 0) * 100) / 100;
    return { mes: period, provas: proofs.length, papel_m2: sum("paperM2"), tinta_ml: sum("inkMl"), custo_total_reais: sum("totalCost") };
  },
};

// ─── CRM: só administrador. O vendedor vê apenas os próprios negócios no funil,
// e estas consultas trazem os de todos. ───────────────────────────────────────
const CRM: Area = {
  label: "CRM",
  declarations: CRM_DECLARATIONS,
  run: (name, args) => executeCrmTool(name, args),
};

export async function areasFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
  const areas: Area[] = [COLOR_PROOF];
  if (canAccessStock(user)) areas.push(STOCK);
  if (user?.role === "ADMIN") areas.push(CRM);

  const byTool = new Map<string, Area>();
  for (const a of areas) for (const d of a.declarations) byTool.set(d.name, a);
  return {
    labels: areas.map((a) => a.label),
    declarations: areas.flatMap((a) => a.declarations),
    /** Executa só ferramentas liberadas para este usuário; devolve também a área usada */
    async run(name: string, args: Record<string, unknown>) {
      const area = byTool.get(name);
      if (!area) return { area: null, output: { erro: "Esta consulta não está liberada para você." } };
      try {
        return { area: area.label, output: await area.run(name, args ?? {}) };
      } catch (err) {
        console.error(`[Luma] Falha na consulta ${name}:`, err instanceof Error ? err.message : err);
        return { area: area.label, output: { erro: "Não consegui consultar esses dados agora." } };
      }
    },
  };
}
