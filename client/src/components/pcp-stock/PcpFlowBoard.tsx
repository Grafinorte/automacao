import { useState } from "react";
import { pcpStockApi, type PcpMovement, type PcpStockItem } from "../../api/pcpStock";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 30;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
const daysText = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);
const actionBtn = "mt-2 w-full rounded-lg bg-[#005cba] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#004a96] disabled:opacity-40";

/** Colunas do quadro; as três primeiras são etapas da OS, as duas últimas são notas */
export type FlowColumn = "PRODUCAO" | "EXPEDICAO" | "ESTOQUE" | "PENDENTE" | "DESPACHADO";
export type DragPayload = { kind: "item"; id: string; from: FlowColumn } | { kind: "mov"; id: string; from: FlowColumn };

/** Para onde cada coluna pode ser arrastada (o resto fica apagado durante o arraste) */
export const DROP_TARGETS: Record<FlowColumn, FlowColumn[]> = {
  PRODUCAO: ["EXPEDICAO"],
  EXPEDICAO: ["PRODUCAO", "ESTOQUE"],
  ESTOQUE: ["PENDENTE"],
  PENDENTE: ["DESPACHADO"],
  DESPACHADO: [],
};

type Owner = (i: { company: string; client: string | null }) => string;

// Ações pequenas com cor e ícone: cada cor indica o tipo de ação
const ICONS = {
  eye: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  edit: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z",
  trash: "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  back: "M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3",
};
const TONE = {
  gray: "border-[rgba(199,198,202,0.6)] text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/15 dark:text-[#d0d0d4] dark:hover:bg-white/5",
  blue: "border-[#005cba]/30 text-[#005cba] hover:bg-[#005cba]/10 dark:text-[#4d9fff]",
  red: "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10",
  amber: "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10",
};

function Action({ icon, label, tone, onClick, disabled, iconOnly }: {
  icon: keyof typeof ICONS; label: string; tone: keyof typeof TONE; onClick: () => void; disabled?: boolean; iconOnly?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }} title={label} aria-label={label}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${TONE[tone]}`}>
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
      </svg>
      {!iconOnly && label}
    </button>
  );
}

function Column({ id, title, hint, count, accent, drag, onDropHere, children }: {
  id: FlowColumn; title: string; hint: string; count: number; accent: string;
  drag: DragPayload | null; onDropHere: (p: DragPayload, to: FlowColumn) => void; children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const canDrop = !!drag && DROP_TARGETS[drag.from].includes(id);
  const dimmed = !!drag && !canDrop && drag.from !== id;
  return (
    <section
      onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (drag && canDrop) onDropHere(drag, id); }}
      className={`flex w-[260px] flex-shrink-0 flex-col rounded-2xl p-2.5 transition-all md:w-auto md:min-w-0 md:flex-1 ${
        over ? "bg-[#005cba]/10 ring-2 ring-[#005cba]" : canDrop ? "bg-[#f3f3f5] outline-dashed outline-2 outline-[#005cba]/50 dark:bg-[#202227]" : "bg-[#f3f3f5] dark:bg-[#202227] dark:ring-1 dark:ring-white/10"
      } ${dimmed ? "opacity-45" : ""}`}>
      <header className="mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accent}`} />
          <h3 className="text-[13px] font-semibold text-[#1a1c1d] dark:text-white">{title}</h3>
          <span className="ml-auto rounded-full bg-white px-2 text-[11.5px] font-semibold tabular-nums text-[#46464a] dark:bg-white/10 dark:text-[#d0d0d4]">{count}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-[#77767b] dark:text-[#a0a0a4]">{canDrop ? "Solte aqui" : hint}</p>
      </header>
      <div className="flex max-h-[62vh] min-h-[60px] flex-col gap-2 overflow-y-auto pr-0.5">
        {count === 0 ? <p className="px-1 py-6 text-center text-[12px] text-[#a0a0a4]">Nada aqui.</p> : children}
      </div>
    </section>
  );
}

function Card({ os, title, owner, payload, onDragStart, onDragEnd, onOpen, children }: {
  os: string | null; title: string; owner: string; payload: DragPayload | null;
  onDragStart: (p: DragPayload) => void; onDragEnd: () => void; onOpen: () => void; children: React.ReactNode;
}) {
  const draggable = !!payload && DROP_TARGETS[payload.from].length > 0;
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => { if (!payload) return; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", payload.id); onDragStart(payload); }}
      onDragEnd={onDragEnd}
      title={draggable ? "Arraste para a próxima etapa" : undefined}
      className={`rounded-xl border border-[rgba(199,198,202,0.35)] bg-white p-3 text-[12.5px] shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#1c1e22] ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-[11px] font-semibold tabular-nums text-[#005cba] dark:text-[#4d9fff]">OS {os ?? "—"}</p>
        <Action icon="eye" label="Ver mais" tone="gray" onClick={onOpen} iconOnly />
      </div>
      <button type="button" onClick={onOpen} className="mt-0.5 block w-full text-left">
        <p className="line-clamp-2 font-medium text-[#1a1c1d] hover:underline dark:text-white" title={title}>{title}</p>
      </button>
      <p className="truncate text-[11.5px] text-[#77767b] dark:text-[#a0a0a4]">{owner}</p>
      {children}
    </article>
  );
}

export function PcpFlowBoard({ items, pending, done, ownerOf, busy, onConclude, onBack, onReceive, onBill, onDispatch, onRemove, onEdit, onOpen, onMove }: {
  items: PcpStockItem[];
  pending: PcpMovement[];
  done: PcpMovement[];
  ownerOf: Owner;
  busy: string | null;
  onConclude: (i: PcpStockItem) => void;
  onBack: (i: PcpStockItem) => void;
  onReceive: (i: PcpStockItem) => void;
  onBill: (i: PcpStockItem) => void;
  onDispatch: (m: PcpMovement) => void;
  onRemove: (i: PcpStockItem) => void;
  onEdit: (i: PcpStockItem) => void;
  onOpen: (itemId: string) => void;
  onMove: (p: DragPayload, to: FlowColumn) => void;
}) {
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const production = items.filter((i) => i.stage === "PRODUCAO");
  const expedition = items.filter((i) => i.stage === "EXPEDICAO");
  const stock = items.filter((i) => i.stage === "ESTOQUE" && i.quantity > 0);
  const since = (i: PcpStockItem) => i.stageAt ?? i.createdAt;
  const drop = (p: DragPayload, to: FlowColumn) => { setDrag(null); onMove(p, to); };
  const colProps = { drag, onDropHere: drop };
  const cardProps = (payload: DragPayload | null, itemId: string) => ({
    payload, onDragStart: setDrag, onDragEnd: () => setDrag(null), onOpen: () => onOpen(itemId),
  });
  const itemActions = (i: PcpStockItem, back?: boolean) => (
    <div className="mt-2 flex flex-wrap gap-1">
      {back && <Action icon="back" label="Voltar p/ produção" tone="amber" disabled={busy === i.id} onClick={() => onBack(i)} />}
      <Action icon="edit" label="Editar" tone="blue" disabled={busy === i.id} onClick={() => onEdit(i)} />
      <Action icon="trash" label="Excluir" tone="red" disabled={busy === i.id} onClick={() => onRemove(i)} />
    </div>
  );

  return (
    <div className="flex gap-3 overflow-x-auto p-3 md:overflow-visible">
      <Column id="PRODUCAO" title="Produção" hint="OS liberada, em produção" count={production.length} accent="bg-violet-500" {...colProps}>
        {production.map((i) => (
          <Card key={i.id} os={i.osNumber} title={i.name} owner={ownerOf(i)} {...cardProps({ kind: "item", id: i.id, from: "PRODUCAO" }, i.id)}>
            <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
              {i.orderedQty !== null ? <>Pedido <b className="tabular-nums">{fmt(i.orderedQty)} {i.unit}</b> · </> : null}{daysText(daysSince(since(i)))}
            </p>
            <button disabled={busy === i.id} onClick={() => onConclude(i)} className={actionBtn}>Produção concluída</button>
            {itemActions(i)}
          </Card>
        ))}
      </Column>

      <Column id="EXPEDICAO" title="Expedição" hint="Concluída, falta conferir e guardar" count={expedition.length} accent="bg-amber-500" {...colProps}>
        {expedition.map((i) => (
          <Card key={i.id} os={i.osNumber} title={i.name} owner={ownerOf(i)} {...cardProps({ kind: "item", id: i.id, from: "EXPEDICAO" }, i.id)}>
            <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
              {i.orderedQty !== null ? <>Pedido <b className="tabular-nums">{fmt(i.orderedQty)} {i.unit}</b> · </> : null}concluída {daysText(daysSince(since(i)))}
            </p>
            <button disabled={busy === i.id} onClick={() => onReceive(i)} className={actionBtn}>Conferir e guardar</button>
            {itemActions(i, true)}
          </Card>
        ))}
      </Column>

      <Column id="ESTOQUE" title="Estoque" hint="Produto acabado, esperando nota" count={stock.length} accent="bg-[#005cba]" {...colProps}>
        {stock.map((i) => {
          const days = daysSince(i.stockedAt ?? i.createdAt);
          return (
            <Card key={i.id} os={i.osNumber} title={i.name} owner={ownerOf(i)} {...cardProps({ kind: "item", id: i.id, from: "ESTOQUE" }, i.id)}>
              <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
                Saldo <b className="tabular-nums text-[#1a1c1d] dark:text-white">{fmt(i.quantity)} {i.unit}</b> ·{" "}
                <span className={days > STALE_DAYS ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{daysText(days)}</span>
              </p>
              <button onClick={() => onBill(i)} className={actionBtn}>Saída com nota</button>
              <div className="mt-2 flex flex-wrap gap-1">
                <Action icon="edit" label="Editar" tone="blue" onClick={() => onEdit(i)} />
              </div>
            </Card>
          );
        })}
      </Column>

      <Column id="PENDENTE" title="A despachar" hint="Nota emitida, material ainda aqui" count={pending.length} accent="bg-red-500" {...colProps}>
        {pending.map((m) => {
          const sent = m.dispatchedQty ?? 0;
          return (
            <Card key={m.id} os={m.item.osNumber} title={m.item.name} owner={ownerOf(m.item)} {...cardProps({ kind: "mov", id: m.id, from: "PENDENTE" }, m.item.id)}>
              <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
                NF <b>{m.invoiceNumber ?? "—"}</b> · <b className="tabular-nums">{fmt(-m.quantity)} {m.item.unit}</b> · {daysText(daysSince(m.createdAt))}
              </p>
              {sent > 0 && (
                <p className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-400">
                  Saiu {fmt(sent)} · falta {fmt(-m.quantity - sent)}
                </p>
              )}
              {m.invoiceFileName
                ? <a href={pcpStockApi.invoiceUrl(m.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex text-[11.5px] font-medium text-[#005cba] hover:underline dark:text-[#4d9fff]">📄 PDF da nota</a>
                : <p className="mt-1 text-[11.5px] font-semibold text-red-600 dark:text-red-400">⚠ Falta o PDF da nota</p>}
              <button disabled={busy === m.id} onClick={() => onDispatch(m)} className={actionBtn}>Despachar</button>
            </Card>
          );
        })}
      </Column>

      <Column id="DESPACHADO" title="Despachado" hint="Últimos 7 dias" count={done.length} accent="bg-green-500" {...colProps}>
        {done.map((m) => (
          <Card key={m.id} os={m.item.osNumber} title={m.item.name} owner={ownerOf(m.item)} {...cardProps(null, m.item.id)}>
            <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
              NF <b>{m.invoiceNumber ?? "—"}</b> · <b className="tabular-nums">{fmt(-m.quantity)} {m.item.unit}</b>
              {m.billedQty !== undefined && m.billedQty > -m.quantity && <> de {fmt(m.billedQty)}</>}
            </p>
            {m.notes && <p className="truncate text-[11px] text-[#46464a] dark:text-[#a0a0a4]" title={m.notes}>{m.notes}</p>}
            {m.invoiceFileName && m.movementId && (
              <a href={pcpStockApi.invoiceUrl(m.movementId)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex text-[11.5px] font-medium text-[#005cba] hover:underline dark:text-[#4d9fff]">📄 PDF da nota</a>
            )}
            <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">
              {m.dispatchedAt ? new Date(m.dispatchedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""} · {m.dispatchedBy}
            </p>
          </Card>
        ))}
      </Column>
    </div>
  );
}
