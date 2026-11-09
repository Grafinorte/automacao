import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  PCP_CATEGORIES, PCP_COMPANIES, PCP_UNITS, pcpStockApi,
  type PcpItemInput, type PcpMovement, type PcpMovementType, type PcpOsData, type PcpSettings, type PcpStockItem,
} from "../api/pcpStock";
import { PcpFlowBoard } from "../components/pcp-stock/PcpFlowBoard";

const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const card = "rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white dark:border-white/10 dark:bg-[#1c1e22]";
const inputCls = "w-full rounded-lg border border-[rgba(199,198,202,0.6)] bg-white px-3 py-2 text-[13px] text-[#1a1c1d] placeholder-[#a0a0a4] focus:border-[#005cba] focus:outline-none focus:ring-2 focus:ring-[#005cba]/15 dark:border-white/10 dark:bg-[#14151a] dark:text-white";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]";
const primaryBtn = "rounded-lg bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#004a96] disabled:opacity-40";
const ghostBtn = "rounded-lg border border-[rgba(199,198,202,0.6)] px-3 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#d0d0d4] dark:hover:bg-white/5";
const rowBtn = "rounded-md px-2 py-1 text-[12px] font-medium text-[#005cba] hover:bg-[#005cba]/10 dark:text-[#4d9fff]";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const companyName = (id: string) => PCP_COMPANIES.find((c) => c.id === id)?.label ?? id;
const ownerOf = (i: { company: string; client: string | null }) => i.client ?? `${companyName(i.company)} (própria)`;
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
const daysText = (d: number) => (d === 0 ? "hoje" : d === 1 ? "1 dia" : `${d} dias`);

function parseNum(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  // "5.000" é cinco mil, como se escreve no Brasil; só "1.5" vale como decimal com ponto
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]">{label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums text-[#1a1c1d] dark:text-white">{value}</p>
      {hint && <p className={`text-[11.5px] ${warn ? "font-semibold text-amber-700 dark:text-amber-400" : "text-[#77767b] dark:text-[#a0a0a4]"}`}>{hint}</p>}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className={`${card} max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold text-[#1a1c1d] dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSubmit, disabled, saving, label, error }: {
  onClose: () => void; onSubmit: () => void; disabled: boolean; saving: boolean; label: string; error: string;
}) {
  return (
    <>
      {error && <p className="mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-white/5">Cancelar</button>
        <button onClick={onSubmit} disabled={disabled || saving} className={primaryBtn}>{saving ? "Salvando..." : label}</button>
      </div>
    </>
  );
}

function Toggle<T extends string | boolean>({ options, value, onChange }: { options: readonly { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button key={o.l} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium ${value === o.v ? "border-[#005cba] bg-[#005cba]/10 text-[#005cba] dark:text-[#4d9fff]" : "border-[rgba(199,198,202,0.6)] text-[#46464a] dark:border-white/10 dark:text-[#d0d0d4]"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ─── Entrada por OS e edição ──────────────────────────────────────────────────
function ItemModal({ item, items, clients, onClose, onSaved }: {
  item: PcpStockItem | null; items: PcpStockItem[]; clients: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [company, setCompany] = useState(item?.company ?? "GRAFINORTE");
  const [osNumber, setOsNumber] = useState(item?.osNumber ?? "");
  const [isClient, setIsClient] = useState(item ? item.client !== null : true);
  const [client, setClient] = useState(item?.client ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "un");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState(item?.location ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [osRead, setOsRead] = useState<PcpOsData | null>(null);
  // Onde a OS começa: em produção (fluxo normal) ou já no estoque (o que já estava pronto)
  const [where, setWhere] = useState<"PRODUCAO" | "ESTOQUE">("PRODUCAO");
  const inProduction = !item && where === "PRODUCAO";

  // O PDF só preenche; a pessoa confere e digita o que foi produzido de fato
  async function readPdf(file: File) {
    setReading(true);
    setError("");
    try {
      const pdf = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não consegui abrir o arquivo."));
        reader.readAsDataURL(file);
      });
      const os = await pcpStockApi.readOs(pdf);
      if (os.company) setCompany(os.company);
      if (os.osNumber) setOsNumber(os.osNumber);
      if (os.client) { setIsClient(true); setClient(os.client); }
      if (os.name) setName(os.name);
      if (os.category) setCategory(os.category);
      setUnit("un");
      if (os.perPack) setNotes(`${fmt(os.perPack)} por pacote`);
      if (os.orderedQty) setQuantity(fmt(os.orderedQty));
      setOsRead(os);
    } catch (e) {
      setOsRead(null);
      setError(errorText(e, "Não consegui ler o PDF."));
    } finally {
      setReading(false);
    }
  }

  const qty = parseNum(quantity);
  // Em produção a quantidade é só o pedido (opcional); no estoque é o que foi produzido
  const qtyOk = !!item || (inProduction ? !quantity.trim() || qty > 0 : qty > 0);
  const valid = !!osNumber.trim() && !!name.trim() && !!category && !!unit && (!isClient || !!client.trim()) && qtyOk;
  const sameOs = !item && osNumber.trim() ? items.filter((i) => i.osNumber === osNumber.trim() && i.company === company) : [];

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError("");
    try { await action(); onSaved(); }
    catch (e) { setError(errorText(e, "Não foi possível salvar.")); setSaving(false); }
  }

  const data: PcpItemInput = {
    company, osNumber, client: isClient ? client : null, name, category, unit,
    location: location || null, notes: notes || null,
  };
  const categoryKnown = PCP_CATEGORIES.some((g) => (g.options as readonly string[]).includes(category));
  const unitKnown = (PCP_UNITS as readonly string[]).includes(unit);

  return (
    <Modal title={item ? "Editar material" : "Nova OS"} subtitle={item ? undefined : "Cadastre a OS quando ela for liberada para a produção."} onClose={onClose}>
      {!item && (
        <div className="mb-4">
          <label className={labelCls}>Onde a OS está agora</label>
          <Toggle options={[{ v: "PRODUCAO" as const, l: "Em produção" }, { v: "ESTOQUE" as const, l: "Já pronta, no estoque" }]} value={where} onChange={setWhere} />
        </div>
      )}
      {!item && (
        <div className="mb-4 rounded-lg border border-dashed border-[rgba(199,198,202,0.8)] p-3 dark:border-white/15">
          <label className={`${ghostBtn} inline-block cursor-pointer ${reading ? "pointer-events-none opacity-50" : ""}`}>
            {reading ? "Lendo a OS..." : "Ler PDF da OS"}
            <input type="file" accept="application/pdf,.pdf" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readPdf(f); }} />
          </label>
          {osRead ? (
            <div className="mt-2 text-[12px] text-[#46464a] dark:text-[#a0a0a4]">
              <p>
                Lido da OS <b>{osRead.osNumber}</b>
                {osRead.orderedQty !== null && <> · pedido <b>{fmt(osRead.orderedQty)}</b></>}
                {osRead.plannedQty !== null && osRead.plannedQty !== osRead.orderedQty && <> · plano <b>{fmt(osRead.plannedQty)}</b></>}
                . Confira os campos.
              </p>
              {!inProduction && <p className="mt-1">
                {osRead.orderedQty !== null
                  ? "A quantidade veio do pedido. Se a produção foi diferente, corrija."
                  : "Não achei a quantidade. Digite a que foi produzida."}
                {osRead.plannedQty !== null && osRead.plannedQty !== osRead.orderedQty && (
                  <button type="button" onClick={() => setQuantity(fmt(osRead.plannedQty!))}
                    className="ml-1 font-semibold text-[#005cba] hover:underline dark:text-[#4d9fff]">
                    Usar o plano ({fmt(osRead.plannedQty)})
                  </button>
                )}
              </p>}
              {(!osRead.company || !osRead.client || !osRead.name || !osRead.category) && (
                <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">
                  Não achei: {[!osRead.company && "empresa", !osRead.client && "cliente", !osRead.name && "material", !osRead.category && "tipo"].filter(Boolean).join(", ")}. Preencha à mão.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">Preenche OS, empresa, cliente e material a partir do PDF do Zênite.</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Empresa</label>
          <Toggle options={PCP_COMPANIES.map((c) => ({ v: c.id as string, l: c.label }))} value={company} onChange={setCompany} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Número da OS</label>
          <input autoFocus={!item} value={osNumber} onChange={(e) => setOsNumber(e.target.value)} className={inputCls} placeholder="Ex.: 12345" />
          {sameOs.length > 0 && (
            <p className="mt-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">
              Esta OS já está cadastrada ({sameOs.map((i) => `${i.name}: ${fmt(i.quantity)} ${i.unit}`).join("; ")}). Para somar ao estoque, cancele e use Entrada na linha dela.
            </p>
          )}
        </div>
        <div className="col-span-2">
          <label className={labelCls}>De quem é o material</label>
          <Toggle options={[{ v: true, l: "Cliente" }, { v: false, l: "Própria empresa" }]} value={isClient} onChange={setIsClient} />
        </div>
        {isClient && (
          <div className="col-span-2">
            <label className={labelCls}>Cliente</label>
            <input list="pcp-clients" value={client} onChange={(e) => setClient(e.target.value)} className={inputCls} placeholder="Nome do cliente" />
            <datalist id="pcp-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        )}
        <div className="col-span-2">
          <label className={labelCls}>Material</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ex.: Copo 300 ml Verão 2026" />
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">Escolha...</option>
            {PCP_CATEGORIES.map((g) => (
              <optgroup key={g.group} label={g.group}>{g.options.map((o) => <option key={o} value={o}>{o}</option>)}</optgroup>
            ))}
            {category && !categoryKnown && <option value={category}>{category}</option>}
          </select>
        </div>
        <div>
          <label className={labelCls}>Unidade</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
            {PCP_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            {!unitKnown && <option value={unit}>{unit}</option>}
          </select>
        </div>
        {!item && (
          <div>
            <label className={labelCls}>{inProduction ? "Quantidade do pedido" : "Quantidade produzida"}</label>
            <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} placeholder="0" />
          </div>
        )}
        <div className={item ? "col-span-2" : ""}>
          <label className={labelCls}>Local no estoque</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="Opcional" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Observação</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Opcional" />
        </div>
      </div>
      <ModalActions
        onClose={onClose} saving={saving} error={error} disabled={!valid}
        label={item ? "Salvar" : inProduction ? "Colocar em produção" : "Registrar entrada"}
        onSubmit={() => void run(() => item
          ? pcpStockApi.updateItem(item.id, data)
          : pcpStockApi.createItem({
            ...data,
            stage: where,
            quantity: inProduction ? 0 : qty,
            orderedQty: inProduction ? (qty > 0 ? qty : osRead?.orderedQty ?? null) : osRead?.orderedQty ?? null,
            plannedQty: osRead?.plannedQty ?? null,
          }))}
      />
    </Modal>
  );
}

// ─── Entrada, saída e ajuste ──────────────────────────────────────────────────
const MOVE_TEXT: Record<PcpMovementType, { title: string; qty: string; action: string }> = {
  ENTRADA: { title: "Entrada no estoque", qty: "Quantidade produzida", action: "Registrar entrada" },
  SAIDA: { title: "Saída por nota fiscal", qty: "Quantidade faturada", action: "Registrar saída" },
  AJUSTE: { title: "Ajuste de contagem", qty: "Saldo contado", action: "Ajustar saldo" },
};

function MovementModal({ item, type, onClose, onSaved }: {
  item: PcpStockItem; type: PcpMovementType; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [takenBy, setTakenBy] = useState(user?.name ?? "");
  const [notes, setNotes] = useState("");
  const [noDispatch, setNoDispatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const text = MOVE_TEXT[type];
  const qty = parseNum(quantity);
  const qtyOk = type === "AJUSTE" ? qty >= 0 : qty > 0;
  const tooMuch = type === "SAIDA" && qty > item.quantity;
  const remaining = type === "SAIDA" && qtyOk && !tooMuch ? item.quantity - qty : null;
  const valid = qtyOk && !tooMuch && (type !== "SAIDA" || (!!takenBy.trim() && !!invoiceNumber.trim())) && (type !== "AJUSTE" || !!notes.trim());

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await pcpStockApi.addMovement(item.id, { type, quantity: qty, takenBy, invoiceNumber, notes, noDispatch: type === "SAIDA" && noDispatch });
      onSaved();
    } catch (e) {
      setError(errorText(e, "Não foi possível registrar."));
      setSaving(false);
    }
  }

  return (
    <Modal title={text.title} subtitle={`OS ${item.osNumber ?? "—"} · ${item.name} · ${ownerOf(item)} · saldo ${fmt(item.quantity)} ${item.unit}`} onClose={onClose}>
      <div className="grid gap-3">
        <div>
          <label className={labelCls}>{text.qty} ({item.unit})</label>
          <input autoFocus inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
          {tooMuch && <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">Maior que o saldo de {fmt(item.quantity)} {item.unit}.</p>}
          {remaining !== null && <p className="mt-1 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">{remaining > 0 ? `Ficam ${fmt(remaining)} ${item.unit} no estoque.` : "O saldo desta OS fica zerado."}</p>}
        </div>
        {type === "SAIDA" && (
          <>
            <div>
              <label className={labelCls}>Número da nota fiscal</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Quem tirou do estoque</label>
              <input value={takenBy} onChange={(e) => setTakenBy(e.target.value)} className={inputCls} />
            </div>
            <NoDispatchCheck checked={noDispatch} onChange={setNoDispatch} />
          </>
        )}
        <div>
          <label className={labelCls}>{type === "AJUSTE" ? "Motivo do ajuste" : "Observação"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder={type === "AJUSTE" ? "Ex.: contagem física" : "Opcional"} />
        </div>
      </div>
      <ModalActions onClose={onClose} onSubmit={() => void submit()} disabled={!valid} saving={saving} label={text.action} error={error} />
    </Modal>
  );
}

function NoDispatchCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-[12.5px] text-[#46464a] dark:text-[#d0d0d4]">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>Cliente retira / não precisa despachar<span className="block text-[11.5px] text-[#77767b] dark:text-[#a0a0a4]">A nota não fica esperando em "A despachar".</span></span>
    </label>
  );
}

// ─── Faturamento: várias OS do mesmo cliente numa nota só ────────────────────
function InvoiceModal({ items, onClose, onSaved }: { items: PcpStockItem[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const available = items.filter((i) => i.stage === "ESTOQUE" && i.quantity > 0);
  const ownerKey = (i: PcpStockItem) => `${i.company}|${i.client ?? ""}`;
  const owners = [...new Map(available.map((i) => [ownerKey(i), `${ownerOf(i)} · ${companyName(i.company)}`])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const [owner, setOwner] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [takenBy, setTakenBy] = useState(user?.name ?? "");
  const [notes, setNotes] = useState("");
  const [noDispatch, setNoDispatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = available.filter((i) => ownerKey(i) === owner);
  function chooseOwner(key: string) {
    setOwner(key);
    // Começa com todas as OS marcadas e o saldo inteiro; desmarca o que não vai
    const list = available.filter((i) => ownerKey(i) === key);
    setChecked(Object.fromEntries(list.map((i) => [i.id, true])));
    setQty(Object.fromEntries(list.map((i) => [i.id, fmt(i.quantity)])));
  }

  const lines = rows.filter((i) => checked[i.id]).map((i) => ({ item: i, quantity: parseNum(qty[i.id] ?? "") }));
  const lineError = (i: PcpStockItem, q: number) => !(q > 0) ? "Quantidade inválida" : q > i.quantity ? `Maior que o saldo de ${fmt(i.quantity)}` : "";
  const valid = lines.length > 0 && lines.every((l) => !lineError(l.item, l.quantity)) && !!invoiceNumber.trim() && !!takenBy.trim();
  const totals = Object.entries(lines.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.item.unit]: (acc[l.item.unit] ?? 0) + (l.quantity > 0 ? l.quantity : 0) }), {}))
    .map(([unit, q]) => `${fmt(q)} ${unit}`).join(" + ");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await pcpStockApi.invoice({ invoiceNumber, takenBy, notes, noDispatch, lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })) });
      onSaved();
    } catch (e) {
      setError(errorText(e, "Não foi possível faturar."));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className={`${card} max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold text-[#1a1c1d] dark:text-white">Faturar</h2>
        <p className="mt-0.5 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">Uma nota com uma ou mais OS do mesmo cliente. Cada OS vira um item da nota.</p>

        <div className="mt-4">
          <label className={labelCls}>Cliente</label>
          <select autoFocus value={owner} onChange={(e) => chooseOwner(e.target.value)} className={inputCls}>
            <option value="">{owners.length ? "Escolha o cliente..." : "Nenhuma OS com saldo no estoque"}</option>
            {owners.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        {owner && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-[rgba(199,198,202,0.4)] dark:border-white/10">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead className="bg-[#f7f7f9] text-[11px] uppercase tracking-wider text-[#77767b] dark:bg-white/5 dark:text-[#a0a0a4]">
                <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">OS</th><th className="px-3 py-2">Material</th><th className="px-3 py-2 text-right">Saldo</th><th className="w-36 px-3 py-2 text-right">Faturar</th></tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const q = parseNum(qty[i.id] ?? "");
                  const err = checked[i.id] ? lineError(i, q) : "";
                  return (
                    <tr key={i.id} className={`border-t border-[rgba(199,198,202,0.3)] dark:border-white/5 ${checked[i.id] ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`Incluir OS ${i.osNumber ?? ""}`} checked={!!checked[i.id]} onChange={(e) => setChecked((c) => ({ ...c, [i.id]: e.target.checked }))} /></td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{i.osNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-[#1a1c1d] dark:text-[#e0e0e4]">{i.name}<p className="text-[11px] text-[#77767b]">parada {daysText(daysSince(i.stockedAt ?? i.createdAt))}</p></td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#46464a] dark:text-[#a0a0a4]">{fmt(i.quantity)} {i.unit}</td>
                      <td className="px-3 py-2 text-right">
                        <input inputMode="decimal" aria-label={`Quantidade da OS ${i.osNumber ?? ""}`} disabled={!checked[i.id]} value={qty[i.id] ?? ""}
                          onChange={(e) => setQty((x) => ({ ...x, [i.id]: e.target.value }))} className={inputCls + " !py-1.5 text-right"} />
                        {err && <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{err}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {owner && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Número da nota fiscal</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Quem tirou do estoque</label>
              <input value={takenBy} onChange={(e) => setTakenBy(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Observação</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Opcional" />
            </div>
            <div className="sm:col-span-2"><NoDispatchCheck checked={noDispatch} onChange={setNoDispatch} /></div>
          </div>
        )}

        {lines.length > 0 && (
          <p className="mt-3 text-[12.5px] text-[#46464a] dark:text-[#a0a0a4]">
            Nota com <b>{lines.length}</b> {lines.length === 1 ? "OS" : "OS"} · total <b className="tabular-nums">{totals}</b>
          </p>
        )}
        <ModalActions onClose={onClose} onSubmit={() => void submit()} disabled={!valid} saving={saving} label="Registrar nota" error={error} />
      </div>
    </div>
  );
}

// ─── Despacho: confere e pode sair só parte da nota ───────────────────────────
function DispatchModal({ movement, onClose, onSaved }: { movement: PcpMovement; onClose: () => void; onSaved: () => void }) {
  const billed = -movement.quantity;
  const sent = movement.dispatchedQty ?? 0;
  const remaining = billed - sent;
  const [quantity, setQuantity] = useState(fmt(remaining));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const qty = parseNum(quantity);
  const tooMuch = qty > remaining;
  const left = qty > 0 && !tooMuch ? remaining - qty : null;

  async function submit() {
    setSaving(true);
    setError("");
    try { await pcpStockApi.dispatch(movement.id, qty, notes); onSaved(); }
    catch (e) { setError(errorText(e, "Não foi possível despachar.")); setSaving(false); }
  }

  return (
    <Modal title="Despachar" subtitle={`NF ${movement.invoiceNumber ?? "—"} · OS ${movement.item.osNumber ?? "—"} · ${movement.item.name} · ${ownerOf(movement.item)}`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="rounded-lg bg-[#f7f7f9] px-3 py-2 text-[12.5px] text-[#46464a] dark:bg-white/5 dark:text-[#a0a0a4]">
          Faturado <b>{fmt(billed)} {movement.item.unit}</b>
          {sent > 0 && <> · já saiu <b>{fmt(sent)}</b> · falta <b>{fmt(remaining)}</b></>}
        </p>
        <div>
          <label className={labelCls}>Quantidade despachada ({movement.item.unit})</label>
          <input autoFocus inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
          {tooMuch && <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">Maior do que falta despachar ({fmt(remaining)}).</p>}
          {left !== null && <p className="mt-1 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">{left > 0 ? `Ficam ${fmt(left)} ${movement.item.unit} para outra viagem; a nota continua em "A despachar".` : "Despacha o restante da nota."}</p>}
        </div>
        <div>
          <label className={labelCls}>Observação</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Motorista, placa, transportadora... (opcional)" />
        </div>
      </div>
      <ModalActions onClose={onClose} onSubmit={() => void submit()} disabled={!(qty > 0) || tooMuch} saving={saving} label="Confirmar despacho" error={error} />
    </Modal>
  );
}

// ─── Conferência da expedição: a OS entra no estoque ─────────────────────────
function ReceiveModal({ item, onClose, onSaved }: { item: PcpStockItem; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState(item.orderedQty ? fmt(item.orderedQty) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const qty = parseNum(quantity);
  const showPlan = item.plannedQty !== null && item.plannedQty !== item.orderedQty;

  async function submit() {
    setSaving(true);
    setError("");
    try { await pcpStockApi.receive(item.id, qty, notes); onSaved(); }
    catch (e) { setError(errorText(e, "Não foi possível guardar.")); setSaving(false); }
  }

  return (
    <Modal title="Conferir e guardar no estoque" subtitle={`OS ${item.osNumber ?? "—"} · ${item.name} · ${ownerOf(item)}`} onClose={onClose}>
      <div className="grid gap-3">
        <div>
          <label className={labelCls}>Quantidade conferida ({item.unit})</label>
          <input autoFocus inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
          <p className="mt-1 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">
            {item.orderedQty !== null ? `Pedido: ${fmt(item.orderedQty)}. Conte e corrija se for diferente.` : "Digite a quantidade contada."}
            {showPlan && (
              <button type="button" onClick={() => setQuantity(fmt(item.plannedQty!))} className="ml-1 font-semibold text-[#005cba] hover:underline dark:text-[#4d9fff]">
                Usar o plano ({fmt(item.plannedQty!)})
              </button>
            )}
          </p>
        </div>
        <div>
          <label className={labelCls}>Observação</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Opcional" />
        </div>
      </div>
      <ModalActions onClose={onClose} onSubmit={() => void submit()} disabled={!(qty > 0)} saving={saving} label="Guardar no estoque" error={error} />
    </Modal>
  );
}

// ─── Relatório mensal ─────────────────────────────────────────────────────────
function ReportModal({ settings, isAdmin, onClose, onChange }: {
  settings: PcpSettings; isAdmin: boolean; onClose: () => void; onChange: (s: PcpSettings) => void;
}) {
  const [recipients, setRecipients] = useState(settings.recipients);
  const [senderUserId, setSenderUserId] = useState(settings.senderUserId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const dirty = recipients !== settings.recipients || senderUserId !== (settings.senderUserId ?? "");
  const configured = !!settings.recipients && !!settings.senderUserId;

  async function run(action: () => Promise<PcpSettings>, onDone?: () => void) {
    setBusy(true);
    setError("");
    setSent(false);
    try { const s = await action(); onChange(s); setRecipients(s.recipients); onDone?.(); }
    catch (e) { setError(errorText(e, "Não foi possível concluir.")); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Relatório mensal" subtitle="Enviado todo dia 1º, às 8h, com o estoque e as movimentações do mês anterior." onClose={onClose}>
      <div className="grid gap-3">
        <div>
          <label className={labelCls}>Quem recebe</label>
          <textarea rows={3} disabled={!isAdmin} value={recipients} onChange={(e) => setRecipients(e.target.value)} className={inputCls + " resize-none disabled:opacity-60"} placeholder="pcp@empresa.com.br, outra.pessoa@empresa.com.br" />
        </div>
        {isAdmin && (
          <div>
            <label className={labelCls}>E-mail que envia</label>
            <select value={senderUserId} onChange={(e) => setSenderUserId(e.target.value)} className={inputCls}>
              <option value="">Escolha...</option>
              {settings.senderUserId && !settings.senders.some((u) => u.id === settings.senderUserId) && (
                <option value={settings.senderUserId} disabled>Remetente sem e-mail configurado</option>
              )}
              {settings.senders.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.smtpEmail})</option>)}
            </select>
            {settings.senders.length === 0 && (
              <p className="mt-1 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">Ninguém configurou o e-mail no perfil ainda. Configure um e-mail e uma senha de app no perfil de um usuário.</p>
            )}
          </div>
        )}
        <div className="rounded-lg bg-[#f7f7f9] px-3 py-2 text-[12px] text-[#46464a] dark:bg-white/5 dark:text-[#a0a0a4]">
          {settings.lastSentAt
            ? <>Último envio: <b>{new Date(settings.lastSentAt).toLocaleString("pt-BR")}</b></>
            : "Nenhum relatório enviado ainda."}
          {!configured && <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">O envio automático só funciona com os dois campos preenchidos.</p>}
          {settings.lastError && <p className="mt-1 font-medium text-red-600 dark:text-red-400">Última falha: {settings.lastError}</p>}
        </div>
      </div>
      {error && <p className="mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
      {sent && <p className="mt-3 text-[12px] font-medium text-green-700 dark:text-green-400">Relatório do mês passado enviado.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-white/5">Fechar</button>
        {isAdmin && (
          <>
            <button disabled={busy || dirty || !configured} onClick={() => { if (confirm("Enviar agora o relatório do mês passado para todos os destinatários?")) void run(() => pcpStockApi.sendReport(), () => setSent(true)); }} className={ghostBtn + " disabled:opacity-40"}>
              Enviar agora
            </button>
            <button disabled={busy || !dirty} onClick={() => void run(() => pcpStockApi.saveSettings({ recipients, senderUserId: senderUserId || null }))} className={primaryBtn}>
              {busy ? "Aguarde..." : "Salvar"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<PcpMovementType, { label: string; cls: string }> = {
  ENTRADA: { label: "Entrada", cls: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" },
  SAIDA: { label: "Saída", cls: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
  AJUSTE: { label: "Ajuste", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
};

export function PcpStockPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [tab, setTab] = useState<"fluxo" | "estoque" | "movimentacoes">("fluxo");
  const [items, setItems] = useState<PcpStockItem[]>([]);
  const [movements, setMovements] = useState<PcpMovement[]>([]);
  const [dispatch, setDispatch] = useState<{ pending: PcpMovement[]; done: PcpMovement[] }>({ pending: [], done: [] });
  const [receiving, setReceiving] = useState<PcpStockItem | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [dispatching, setDispatching] = useState<PcpMovement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<PcpSettings | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [owner, setOwner] = useState("");
  const [category, setCategory] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [editing, setEditing] = useState<PcpStockItem | "new" | null>(null);
  const [moving, setMoving] = useState<{ item: PcpStockItem; type: PcpMovementType } | null>(null);
  const [showReport, setShowReport] = useState(false);

  async function loadAll() {
    setError("");
    try {
      const [i, m, s, d] = await Promise.all([pcpStockApi.listItems(), pcpStockApi.listMovements(month), pcpStockApi.getSettings(), pcpStockApi.listDispatch()]);
      setItems(i);
      setMovements(m);
      setSettings(s);
      setDispatch(d);
    } catch (e) {
      setError(errorText(e, "Não foi possível carregar o estoque."));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadAll(); }, [month]);

  const clients = useMemo(
    () => [...new Set(items.map((i) => i.client).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [items],
  );
  const owners = useMemo(() => [...new Set(items.map(ownerOf))].sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);

  const inStock = items.filter((i) => i.stage === "ESTOQUE" && i.quantity > 0);
  const stale = inStock.filter((i) => daysSince(i.stockedAt ?? i.createdAt) > STALE_DAYS);

  const needle = search.trim().toLowerCase();
  const itemMatches = (i: PcpStockItem) =>
    (!company || i.company === company) &&
    (!owner || ownerOf(i) === owner) &&
    (!category || i.category === category) &&
    (!needle || `${i.osNumber ?? ""} ${i.name} ${ownerOf(i)} ${i.location ?? ""}`.toLowerCase().includes(needle));
  const movementMatches = (m: PcpMovement) =>
    (!company || m.item.company === company) &&
    (!owner || ownerOf(m.item) === owner) &&
    (!category || m.item.category === category) &&
    (!needle || `${m.item.osNumber ?? ""} ${m.invoiceNumber ?? ""} ${m.item.name} ${ownerOf(m.item)} ${m.takenBy ?? ""} ${m.notes ?? ""} ${m.createdByName}`.toLowerCase().includes(needle));
  const boardItems = items.filter(itemMatches);
  const visibleItems = items.filter((i) => i.stage === "ESTOQUE" && (showZero || i.quantity !== 0) && itemMatches(i));
  const visibleMovements = movements.filter(movementMatches);

  async function step(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    try { await action(); await loadAll(); }
    catch (e) { alert(errorText(e, "Não foi possível concluir.")); }
    finally { setBusy(null); }
  }
  const conclude = (i: PcpStockItem) => {
    if (confirm(`Produção concluída da OS ${i.osNumber ?? ""}? Ela vai para a expedição conferir.`)) void step(i.id, () => pcpStockApi.moveStage(i.id, "EXPEDICAO"));
  };
  const backToProduction = (i: PcpStockItem) => void step(i.id, () => pcpStockApi.moveStage(i.id, "PRODUCAO"));
  const markDispatched = (m: PcpMovement) => setDispatching(m);

  // Soma por unidade: mostra a sobra de um mesmo material espalhada em várias OS
  const listTotal = Object.entries(
    visibleItems.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.unit]: (acc[i.unit] ?? 0) + i.quantity }), {}),
  ).map(([unit, qty]) => `${fmt(qty)} ${unit}`).join(" + ");

  const afterSave = () => {
    setEditing(null);
    setMoving(null);
    setReceiving(null);
    setInvoicing(false);
    setDispatching(null);
    void loadAll();
  };

  async function remove(i: PcpStockItem) {
    const label = `OS ${i.osNumber ?? "sem número"} · ${i.name}`;
    if (!confirm(`Excluir ${label}?\n\nSe não teve saída com nota, ela é apagada junto com as entradas. Se já teve, sai da lista mas continua no histórico.`)) return;
    try {
      await pcpStockApi.removeItem(i.id);
      void loadAll();
    } catch (e) {
      alert(errorText(e, "Não foi possível excluir."));
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1c1d] dark:text-white">Controle de estoque PCP</h1>
            <p className="text-[13px] text-[#77767b] dark:text-[#a0a0a4]">Produção → expedição → estoque → nota fiscal → despacho.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowReport(true)} disabled={!settings} className={ghostBtn}>Relatório mensal</button>
            <button onClick={() => setInvoicing(true)} className={ghostBtn}>Faturar</button>
            <button onClick={() => setEditing("new")} className={primaryBtn}>Nova OS</button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        {settings?.lastError && (
          <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            O último relatório mensal não foi enviado. {settings.lastError}
          </p>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Em produção" value={String(items.filter((i) => i.stage === "PRODUCAO").length)} />
          <Kpi label="Na expedição" value={String(items.filter((i) => i.stage === "EXPEDICAO").length)} />
          <Kpi label="No estoque" value={String(inStock.length)} hint={stale.length ? `${stale.length} parada(s) há mais de ${STALE_DAYS} dias` : undefined} warn />
          <Kpi label="A despachar" value={String(dispatch.pending.length)} />
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(199,198,202,0.3)] px-4 py-3 dark:border-white/10">
            <div className="flex rounded-lg bg-[#f3f3f5] p-0.5 dark:bg-white/5">
              {([["fluxo", "Fluxo"], ["estoque", "Estoque"], ["movimentacoes", "Movimentações"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${tab === id ? "bg-white text-[#1a1c1d] shadow-sm dark:bg-[#2a2c31] dark:text-white" : "text-[#77767b] dark:text-[#a0a0a4]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar OS, nota, material..." className={inputCls + " !w-full sm:!w-56"} />
            <select aria-label="Empresa" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls + " !w-full sm:!w-40"}>
              <option value="">Todas as empresas</option>
              {PCP_COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select aria-label="Dono" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls + " !w-full sm:!w-44"}>
              <option value="">Todos os donos</option>
              {owners.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Tipo" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls + " !w-full sm:!w-36"}>
              <option value="">Todos os tipos</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {tab === "fluxo" ? null : tab === "estoque" ? (
              <label className="flex items-center gap-1.5 text-[12.5px] text-[#46464a] dark:text-[#a0a0a4]">
                <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
                Mostrar saldo zerado
              </label>
            ) : (
              <input aria-label="Mês" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputCls + " !w-full sm:!w-44"} />
            )}
          </div>

          {loading ? (
            <p className="py-12 text-center text-[13px] text-[#77767b]">Carregando...</p>
          ) : tab === "fluxo" ? (
            <PcpFlowBoard
              items={boardItems}
              pending={dispatch.pending.filter(movementMatches)}
              done={dispatch.done.filter(movementMatches)}
              ownerOf={ownerOf}
              busy={busy}
              onConclude={conclude}
              onBack={backToProduction}
              onReceive={setReceiving}
              onBill={(i) => setMoving({ item: i, type: "SAIDA" })}
              onDispatch={markDispatched}
              onRemove={(i) => void remove(i)}
              onEdit={setEditing}
            />
          ) : tab === "estoque" ? (
            visibleItems.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#77767b]">{items.length === 0 ? "Nenhuma OS no estoque. Clique em Nova OS para começar." : "Nada encontrado com esses filtros."}</p>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]">
                    <tr>
                      <th className="px-4 py-2.5">OS</th><th className="px-4 py-2.5">Material</th><th className="px-4 py-2.5">Dono</th>
                      <th className="px-4 py-2.5">Local</th><th className="px-4 py-2.5 text-right">No estoque</th><th className="px-4 py-2.5 text-right">Saldo</th><th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((i) => {
                      const days = daysSince(i.stockedAt ?? i.createdAt);
                      return (
                        <tr key={i.id} className="border-t border-[rgba(199,198,202,0.25)] text-[#1a1c1d] dark:border-white/5 dark:text-[#e0e0e4]">
                          <td className="whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums">{i.osNumber ?? "—"}</td>
                          <td className="px-4 py-2.5 font-medium">{i.name}<p className="text-[11.5px] font-normal text-[#77767b]">{i.category}{i.notes ? ` · ${i.notes}` : ""}</p></td>
                          <td className="px-4 py-2.5">{ownerOf(i)}<p className="text-[11.5px] text-[#77767b]">{companyName(i.company)}</p></td>
                          <td className="px-4 py-2.5 text-[#77767b] dark:text-[#a0a0a4]">{i.location ?? "—"}</td>
                          <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${i.quantity > 0 && days > STALE_DAYS ? "font-semibold text-amber-700 dark:text-amber-400" : "text-[#77767b] dark:text-[#a0a0a4]"}`}>{i.quantity > 0 ? daysText(days) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{fmt(i.quantity)} {i.unit}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <button onClick={() => setMoving({ item: i, type: "ENTRADA" })} className={rowBtn}>Entrada</button>
                            <button onClick={() => setMoving({ item: i, type: "SAIDA" })} disabled={i.quantity <= 0} className={rowBtn + " disabled:opacity-40"}>Saída</button>
                            <button onClick={() => setMoving({ item: i, type: "AJUSTE" })} className={rowBtn}>Ajustar</button>
                            <button onClick={() => setEditing(i)} className={rowBtn}>Editar</button>
                            <button onClick={() => void remove(i)} title="Excluir" aria-label={`Excluir OS ${i.osNumber ?? ""}`}
                              className="ml-1 rounded-md p-1 align-middle text-[#a0a0a4] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visibleItems.length > 1 && (
                <p className="border-t border-[rgba(199,198,202,0.3)] px-4 py-2.5 text-right text-[12.5px] text-[#46464a] dark:border-white/10 dark:text-[#a0a0a4]">
                  Total da lista: <b className="tabular-nums text-[#1a1c1d] dark:text-white">{listTotal}</b> em {visibleItems.length} linhas
                </p>
              )}
              </>
            )
          ) : visibleMovements.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-[#77767b]">Nenhuma movimentação neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]">
                  <tr>
                    <th className="px-4 py-2.5">Data</th><th className="px-4 py-2.5">OS</th><th className="px-4 py-2.5">Material</th><th className="px-4 py-2.5">Tipo</th>
                    <th className="px-4 py-2.5 text-right">Qtd.</th><th className="px-4 py-2.5 text-right">Saldo</th><th className="px-4 py-2.5">NF</th>
                    <th className="px-4 py-2.5">Quem tirou</th><th className="px-4 py-2.5">Despacho</th><th className="px-4 py-2.5">Obs.</th><th className="px-4 py-2.5">Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.map((m) => (
                    <tr key={m.id} className="border-t border-[rgba(199,198,202,0.25)] text-[#1a1c1d] dark:border-white/5 dark:text-[#e0e0e4]">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums">{m.item.osNumber ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium">{m.item.name}<p className="text-[11.5px] font-normal text-[#77767b]">{ownerOf(m.item)}</p></td>
                      <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_STYLE[m.type].cls}`}>{TYPE_STYLE[m.type].label}</span></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{m.quantity > 0 ? "+" : ""}{fmt(m.quantity)} {m.item.unit}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(m.balanceAfter)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{m.invoiceNumber ?? "—"}</td>
                      <td className="px-4 py-2.5">{m.takenBy ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px]">
                        {m.type !== "SAIDA" ? "—" : !m.dispatchedAt && (m.dispatchedQty ?? 0) > 0
                          ? <span className="font-medium text-amber-700 dark:text-amber-400">parcial: {fmt(m.dispatchedQty!)} de {fmt(-m.quantity)}</span>
                          : m.dispatchedAt
                          ? `${new Date(m.dispatchedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${m.dispatchedBy ?? ""}`
                          : <span className="font-medium text-red-600 dark:text-red-400">pendente</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#77767b] dark:text-[#a0a0a4]">{[m.reference, m.notes].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-2.5">{m.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && <ItemModal item={editing === "new" ? null : editing} items={items} clients={clients} onClose={() => setEditing(null)} onSaved={afterSave} />}
      {moving && <MovementModal item={moving.item} type={moving.type} onClose={() => setMoving(null)} onSaved={afterSave} />}
      {dispatching && <DispatchModal movement={dispatching} onClose={() => setDispatching(null)} onSaved={afterSave} />}
      {invoicing && <InvoiceModal items={items} onClose={() => setInvoicing(false)} onSaved={afterSave} />}
      {receiving && <ReceiveModal item={receiving} onClose={() => setReceiving(null)} onSaved={afterSave} />}
      {showReport && settings && <ReportModal settings={settings} isAdmin={isAdmin} onClose={() => setShowReport(false)} onChange={setSettings} />}
    </div>
  );
}
