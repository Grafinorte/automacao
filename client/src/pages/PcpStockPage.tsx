import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  PCP_CATEGORIES, PCP_COMPANIES, PCP_UNITS, pcpStockApi,
  type PcpItemInput, type PcpMovement, type PcpMovementType, type PcpOsData, type PcpSettings, type PcpStockItem,
} from "../api/pcpStock";

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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]">{label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums text-[#1a1c1d] dark:text-white">{value}</p>
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
  const qtyOk = !!item || qty > 0;
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
    <Modal title={item ? "Editar material" : "Entrada por OS"} subtitle={item ? undefined : "Registre o material que a produção concluiu."} onClose={onClose}>
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
              <p className="mt-1">
                {osRead.orderedQty !== null
                  ? "A quantidade veio do pedido. Se a produção foi diferente, corrija."
                  : "Não achei a quantidade. Digite a que foi produzida."}
                {osRead.plannedQty !== null && osRead.plannedQty !== osRead.orderedQty && (
                  <button type="button" onClick={() => setQuantity(fmt(osRead.plannedQty!))}
                    className="ml-1 font-semibold text-[#005cba] hover:underline dark:text-[#4d9fff]">
                    Usar o plano ({fmt(osRead.plannedQty)})
                  </button>
                )}
              </p>
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
              Esta OS já está no estoque ({sameOs.map((i) => `${i.name}: ${fmt(i.quantity)} ${i.unit}`).join("; ")}). Para somar, cancele e use Entrada na linha dela.
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
            <label className={labelCls}>Quantidade produzida</label>
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
      {item && (
        <div className="mt-4 border-t border-[rgba(199,198,202,0.3)] pt-3 dark:border-white/10">
          <button
            disabled={item.quantity !== 0 || saving}
            onClick={() => { if (confirm(`Arquivar "${item.name}"? O histórico continua nos relatórios.`)) void run(() => pcpStockApi.archiveItem(item.id)); }}
            className="text-[12px] font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-[#a0a0a4] disabled:no-underline dark:text-red-400"
          >
            Arquivar material
          </button>
          {item.quantity !== 0 && <span className="ml-2 text-[11.5px] text-[#77767b]">Só com saldo zerado.</span>}
        </div>
      )}
      <ModalActions
        onClose={onClose} saving={saving} error={error} disabled={!valid} label={item ? "Salvar" : "Registrar entrada"}
        onSubmit={() => void run(() => item ? pcpStockApi.updateItem(item.id, data) : pcpStockApi.createItem({ ...data, quantity: qty }))}
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
      await pcpStockApi.addMovement(item.id, { type, quantity: qty, takenBy, invoiceNumber, notes });
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
  const [tab, setTab] = useState<"estoque" | "movimentacoes">("estoque");
  const [items, setItems] = useState<PcpStockItem[]>([]);
  const [movements, setMovements] = useState<PcpMovement[]>([]);
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
      const [i, m, s] = await Promise.all([pcpStockApi.listItems(), pcpStockApi.listMovements(month), pcpStockApi.getSettings()]);
      setItems(i);
      setMovements(m);
      setSettings(s);
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

  const pending = items.filter((i) => i.quantity > 0);
  const stale = pending.filter((i) => daysSince(i.createdAt) > STALE_DAYS);

  const needle = search.trim().toLowerCase();
  const visibleItems = items.filter((i) =>
    (showZero || i.quantity !== 0) &&
    (!company || i.company === company) &&
    (!owner || ownerOf(i) === owner) &&
    (!category || i.category === category) &&
    (!needle || `${i.osNumber ?? ""} ${i.name} ${ownerOf(i)} ${i.location ?? ""}`.toLowerCase().includes(needle)));
  const visibleMovements = movements.filter((m) =>
    (!company || m.item.company === company) &&
    (!owner || ownerOf(m.item) === owner) &&
    (!category || m.item.category === category) &&
    (!needle || `${m.item.osNumber ?? ""} ${m.invoiceNumber ?? ""} ${m.item.name} ${ownerOf(m.item)} ${m.takenBy ?? ""} ${m.notes ?? ""} ${m.createdByName}`.toLowerCase().includes(needle)));

  // Soma por unidade: mostra a sobra de um mesmo material espalhada em várias OS
  const listTotal = Object.entries(
    visibleItems.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.unit]: (acc[i.unit] ?? 0) + i.quantity }), {}),
  ).map(([unit, qty]) => `${fmt(qty)} ${unit}`).join(" + ");

  const afterSave = () => {
    setEditing(null);
    setMoving(null);
    void loadAll();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1c1d] dark:text-white">Controle de estoque PCP</h1>
            <p className="text-[13px] text-[#77767b] dark:text-[#a0a0a4]">Material produzido entra pela OS e sai pela nota fiscal.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowReport(true)} disabled={!settings} className={ghostBtn}>Relatório mensal</button>
            <button onClick={() => setEditing("new")} className={primaryBtn}>Entrada por OS</button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        {settings?.lastError && (
          <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            O último relatório mensal não foi enviado. {settings.lastError}
          </p>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Produzido e não faturado" value={String(pending.length)} />
          <Kpi label={`Há mais de ${STALE_DAYS} dias`} value={String(stale.length)} />
          <Kpi label="Entradas no mês" value={String(movements.filter((m) => m.type === "ENTRADA").length)} />
          <Kpi label="Saídas no mês" value={String(movements.filter((m) => m.type === "SAIDA").length)} />
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(199,198,202,0.3)] px-4 py-3 dark:border-white/10">
            <div className="flex rounded-lg bg-[#f3f3f5] p-0.5 dark:bg-white/5">
              {([["estoque", "Estoque"], ["movimentacoes", "Movimentações"]] as const).map(([id, label]) => (
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
            {tab === "estoque" ? (
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
          ) : tab === "estoque" ? (
            visibleItems.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#77767b]">{items.length === 0 ? "Nenhuma OS no estoque. Clique em Entrada por OS para começar." : "Nada encontrado com esses filtros."}</p>
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
                      const days = daysSince(i.createdAt);
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
                    <th className="px-4 py-2.5">Quem tirou</th><th className="px-4 py-2.5">Obs.</th><th className="px-4 py-2.5">Registrado por</th>
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
      {showReport && settings && <ReportModal settings={settings} isAdmin={isAdmin} onClose={() => setShowReport(false)} onChange={setSettings} />}
    </div>
  );
}
