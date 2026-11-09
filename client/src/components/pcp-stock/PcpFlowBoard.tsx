import type { PcpMovement, PcpStockItem } from "../../api/pcpStock";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 30;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
const daysText = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);
const actionBtn = "mt-2 w-full rounded-lg bg-[#005cba] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#004a96] disabled:opacity-40";
const linkBtn = "text-[11.5px] font-medium text-[#77767b] hover:text-[#005cba] hover:underline dark:text-[#a0a0a4]";

type Owner = (i: { company: string; client: string | null }) => string;

function Column({ title, hint, count, accent, children }: { title: string; hint: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <section className="flex w-[260px] flex-shrink-0 flex-col rounded-2xl bg-[#f3f3f5] p-2.5 dark:bg-white/[0.04] md:w-auto md:min-w-0 md:flex-1">
      <header className="mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accent}`} />
          <h3 className="text-[13px] font-semibold text-[#1a1c1d] dark:text-white">{title}</h3>
          <span className="ml-auto rounded-full bg-white px-2 text-[11.5px] font-semibold tabular-nums text-[#46464a] dark:bg-white/10 dark:text-[#d0d0d4]">{count}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-[#77767b] dark:text-[#a0a0a4]">{hint}</p>
      </header>
      <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto pr-0.5">
        {count === 0 ? <p className="px-1 py-6 text-center text-[12px] text-[#a0a0a4]">Nada aqui.</p> : children}
      </div>
    </section>
  );
}

function Card({ os, title, owner, children }: { os: string | null; title: string; owner: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-[rgba(199,198,202,0.35)] bg-white p-3 text-[12.5px] shadow-sm dark:border-white/10 dark:bg-[#1c1e22]">
      <p className="text-[11px] font-semibold tabular-nums text-[#005cba] dark:text-[#4d9fff]">OS {os ?? "—"}</p>
      <p className="mt-0.5 line-clamp-2 font-medium text-[#1a1c1d] dark:text-white" title={title}>{title}</p>
      <p className="truncate text-[11.5px] text-[#77767b] dark:text-[#a0a0a4]">{owner}</p>
      {children}
    </article>
  );
}

export function PcpFlowBoard({ items, pending, done, ownerOf, busy, onConclude, onBack, onReceive, onBill, onDispatch, onRemove, onEdit }: {
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
}) {
  const production = items.filter((i) => i.stage === "PRODUCAO");
  const expedition = items.filter((i) => i.stage === "EXPEDICAO");
  const stock = items.filter((i) => i.stage === "ESTOQUE" && i.quantity > 0);
  const since = (i: PcpStockItem) => i.stageAt ?? i.createdAt;

  return (
    <div className="flex gap-3 overflow-x-auto p-3 md:overflow-visible">
      <Column title="Produção" hint="OS liberada, em produção" count={production.length} accent="bg-violet-500">
        {production.map((i) => (
          <Card key={i.id} os={i.osNumber} title={i.name} owner={ownerOf(i)}>
            <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
              {i.orderedQty !== null ? <>Pedido <b className="tabular-nums">{fmt(i.orderedQty)} {i.unit}</b> · </> : null}{daysText(daysSince(since(i)))}
            </p>
            <button disabled={busy === i.id} onClick={() => onConclude(i)} className={actionBtn}>Produção concluída</button>
            <div className="mt-1.5 flex justify-between">
              <button disabled={busy === i.id} onClick={() => onEdit(i)} className={linkBtn}>Editar</button>
              <button disabled={busy === i.id} onClick={() => onRemove(i)} className={linkBtn}>Excluir</button>
            </div>
          </Card>
        ))}
      </Column>

      <Column title="Expedição" hint="Concluída, falta conferir e guardar" count={expedition.length} accent="bg-amber-500">
        {expedition.map((i) => (
          <Card key={i.id} os={i.osNumber} title={i.name} owner={ownerOf(i)}>
            <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
              {i.orderedQty !== null ? <>Pedido <b className="tabular-nums">{fmt(i.orderedQty)} {i.unit}</b> · </> : null}concluída {daysText(daysSince(since(i)))}
            </p>
            <button disabled={busy === i.id} onClick={() => onReceive(i)} className={actionBtn}>Conferir e guardar</button>
            <div className="mt-1.5 flex justify-between">
              <button disabled={busy === i.id} onClick={() => onBack(i)} className={linkBtn}>Voltar para a produção</button>
              <span className="flex gap-2">
                <button disabled={busy === i.id} onClick={() => onEdit(i)} className={linkBtn}>Editar</button>
                <button disabled={busy === i.id} onClick={() => onRemove(i)} className={linkBtn}>Excluir</button>
              </span>
            </div>
          </Card>
        ))}
      </Column>

      <Column title="Estoque" hint="Produto acabado, esperando nota" count={stock.length} accent="bg-[#005cba]">
        {stock.map((i) => {
          const days = daysSince(i.stockedAt ?? i.createdAt);
          return (
            <Card key={i.id} os={i.osNumber} title={i.name} owner={ownerOf(i)}>
              <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
                Saldo <b className="tabular-nums text-[#1a1c1d] dark:text-white">{fmt(i.quantity)} {i.unit}</b> ·{" "}
                <span className={days > STALE_DAYS ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{daysText(days)}</span>
              </p>
              <button onClick={() => onBill(i)} className={actionBtn}>Saída com nota</button>
              <button onClick={() => onEdit(i)} className={`${linkBtn} mt-1.5`}>Editar</button>
            </Card>
          );
        })}
      </Column>

      <Column title="A despachar" hint="Nota emitida, material ainda aqui" count={pending.length} accent="bg-red-500">
        {pending.map((m) => {
          const sent = m.dispatchedQty ?? 0;
          return (
            <Card key={m.id} os={m.item.osNumber} title={m.item.name} owner={ownerOf(m.item)}>
              <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
                NF <b>{m.invoiceNumber ?? "—"}</b> · <b className="tabular-nums">{fmt(-m.quantity)} {m.item.unit}</b> · {daysText(daysSince(m.createdAt))}
              </p>
              {sent > 0 && (
                <p className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-400">
                  Saiu {fmt(sent)} · falta {fmt(-m.quantity - sent)}
                </p>
              )}
              <button disabled={busy === m.id} onClick={() => onDispatch(m)} className={actionBtn}>Despachar</button>
            </Card>
          );
        })}
      </Column>

      <Column title="Despachado" hint="Últimos 7 dias" count={done.length} accent="bg-green-500">
        {done.map((m) => (
          <Card key={m.id} os={m.item.osNumber} title={m.item.name} owner={ownerOf(m.item)}>
            <p className="mt-1 text-[11.5px] text-[#46464a] dark:text-[#a0a0a4]">
              NF <b>{m.invoiceNumber ?? "—"}</b> · <b className="tabular-nums">{fmt(-m.quantity)} {m.item.unit}</b>
              {m.billedQty !== undefined && m.billedQty > -m.quantity && <> de {fmt(m.billedQty)}</>}
            </p>
            {m.notes && <p className="truncate text-[11px] text-[#46464a] dark:text-[#a0a0a4]" title={m.notes}>{m.notes}</p>}
            <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">
              {m.dispatchedAt ? new Date(m.dispatchedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""} · {m.dispatchedBy}
            </p>
          </Card>
        ))}
      </Column>
    </div>
  );
}
