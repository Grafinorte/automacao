import { useEffect, useState, useCallback } from "react";
import { stockApi } from "../api/stock";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import type { StockItem, StockMovement, StockMovementType } from "../types";
import { STOCK_CATEGORIES, STOCK_UNITS } from "../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function stockStatus(item: StockItem): "ok" | "low" | "out" {
  if (item.quantity <= 0) return "out";
  if (item.minQuantity > 0 && item.quantity <= item.minQuantity) return "low";
  return "ok";
}

function qty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function QuantityBadge({ item }: { item: StockItem }) {
  const s = stockStatus(item);
  const cls =
    s === "out" ? "bg-red-100 text-red-700 ring-1 ring-red-200"
    : s === "low" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200"
    : "bg-green-100 text-green-700";
  return (
    <span className={`rounded-lg px-2.5 py-1 text-base font-bold tabular-nums ${cls}`}>
      {qty(item.quantity)} <span className="text-xs font-normal">{item.unit}</span>
    </span>
  );
}

function CategoryBadge({ cat }: { cat: string }) {
  const color: Record<string, string> = {
    Papel: "bg-blue-100 text-blue-700",
    Tinta: "bg-purple-100 text-purple-700",
    Insumo: "bg-orange-100 text-orange-700",
    Embalagem: "bg-teal-100 text-teal-700",
    Outros: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color[cat] ?? "bg-gray-100 text-gray-600"}`}>
      {cat}
    </span>
  );
}

// ─── Movement modal ───────────────────────────────────────────────────────────

function MovementModal({
  item, type, onClose, onDone,
}: {
  item: StockItem;
  type: "ENTRADA" | "SAIDA";
  onClose: () => void;
  onDone: (updated: StockItem) => void;
}) {
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!n || n <= 0) { setError("Informe uma quantidade válida"); return; }
    setLoading(true);
    setError(null);
    try {
      const { item: updated } = await stockApi.addMovement(item.id, type, n, notes.trim() || undefined);
      onDone(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao registrar movimentação");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className={`rounded-t-xl px-5 py-4 ${type === "ENTRADA" ? "bg-green-600" : "bg-red-600"} text-white`}>
          <p className="font-semibold">{type === "ENTRADA" ? "Entrada de estoque" : "Dar baixa"}</p>
          <p className="mt-0.5 text-sm opacity-90">{item.name}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Quantidade ({item.unit})
            </label>
            <input
              autoFocus
              type="number"
              min="0.01"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`Informe a quantidade em ${item.unit}`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            {type === "SAIDA" && item.minQuantity > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Disponível: <strong>{qty_(item.quantity)} {item.unit}</strong> · Mínimo: {qty_(item.minQuantity)}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Observação <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={type === "ENTRADA" ? "Ex: Compra NF 1234, fornecedor XYZ" : "Ex: Usado no job 456, cliente ABC"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Salvando..." : type === "ENTRADA" ? "Registrar entrada" : "Registrar baixa"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function qty_(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

// ─── History modal ────────────────────────────────────────────────────────────

function HistoryModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stockApi.getMovements(item.id)
      .then(setMovements)
      .finally(() => setLoading(false));
  }, [item.id]);

  function typeLabel(t: StockMovementType) {
    if (t === "ENTRADA") return { label: "Entrada", cls: "bg-green-100 text-green-700" };
    if (t === "SAIDA") return { label: "Baixa", cls: "bg-red-100 text-red-700" };
    return { label: "Ajuste", cls: "bg-gray-100 text-gray-600" };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl" style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between rounded-t-xl bg-gray-900 px-5 py-4 text-white">
          <div>
            <p className="font-semibold">Histórico de movimentações</p>
            <p className="mt-0.5 text-sm opacity-75">{item.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="py-6 text-center text-sm text-gray-500">Carregando...</p>}
          {!loading && movements.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">Nenhuma movimentação registrada</p>
          )}
          {!loading && movements.length > 0 && (
            <div className="space-y-2">
              {movements.map((m) => {
                const { label, cls } = typeLabel(m.type);
                const sign = m.quantity > 0 ? "+" : "";
                return (
                  <div key={m.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {sign}{qty_(m.quantity)} {item.unit}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{fmtDate(m.createdAt)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{m.user.name}</span>
                      {m.notes && <><span>·</span><span>{m.notes}</span></>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item form modal (admin) ──────────────────────────────────────────────────

function ItemModal({
  initial, onClose, onDone,
}: {
  initial?: StockItem;
  onClose: () => void;
  onDone: (item: StockItem) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Papel");
  const [unit, setUnit] = useState(initial?.unit ?? "Resma");
  const [customUnit, setCustomUnit] = useState("");
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "0");
  const [minQuantity, setMinQuantity] = useState(initial ? String(initial.minQuantity) : "0");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial;
  const unitValue = unit === "__custom__" ? customUnit : unit;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome obrigatório"); return; }
    if (!unitValue.trim()) { setError("Unidade obrigatória"); return; }
    setLoading(true);
    setError(null);
    try {
      const data = {
        name: name.trim(), category, unit: unitValue.trim(),
        minQuantity: Number(minQuantity) || 0,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      let result: StockItem;
      if (isEdit) {
        result = await stockApi.updateItem(initial.id, data);
      } else {
        result = await stockApi.createItem({ ...data, quantity: Number(quantity) || 0 });
      }
      onDone(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="rounded-t-xl bg-gray-900 px-5 py-4 text-white">
          <p className="font-semibold">{isEdit ? "Editar item" : "Novo item de estoque"}</p>
        </div>
        <form onSubmit={submit} className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nome *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Papel Offset 90g" autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Categoria *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none">
                {STOCK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Unidade *</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none">
                {STOCK_UNITS.map((u) => <option key={u}>{u}</option>)}
                <option value="__custom__">Outra...</option>
              </select>
              {unit === "__custom__" && (
                <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="Ex: Bobina" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Qtd. inicial</label>
                <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Qtd. mínima (alerta)</label>
              <input type="number" min="0" step="any" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Localização</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Prateleira A-3, Depósito 2"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Observações</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais sobre este item"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar item"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ActiveModal =
  | { type: "movement"; item: StockItem; movType: "ENTRADA" | "SAIDA" }
  | { type: "history"; item: StockItem }
  | { type: "item-form"; item?: StockItem };

const ALL_CAT = "Todos";

export function StockPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ActiveModal | null>(null);
  const [catFilter, setCatFilter] = useState<string>(ALL_CAT);
  const [onlyLow, setOnlyLow] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await stockApi.listItems());
    } catch {
      setError("Não foi possível carregar o estoque");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateItem(updated: StockItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setModal(null);
  }

  function addItem(item: StockItem) {
    setItems((prev) => [...prev, item]);
    setModal(null);
  }

  async function handleDelete(item: StockItem) {
    if (!confirm(`Desativar "${item.name}"? O histórico será mantido.`)) return;
    try {
      await stockApi.deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erro ao excluir");
    }
  }

  const allCategories = [ALL_CAT, ...Array.from(new Set(items.map((i) => i.category))).sort()];

  const filtered = items.filter((i) => {
    if (catFilter !== ALL_CAT && i.category !== catFilter) return false;
    if (onlyLow && stockStatus(i) === "ok") return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const lowCount = items.filter((i) => stockStatus(i) !== "ok").length;

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Almoxarifado</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {items.length} {items.length === 1 ? "item" : "itens"}
            {lowCount > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {lowCount} com estoque baixo
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setModal({ type: "item-form" })}>+ Novo item</Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar item..."
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {allCategories.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                catFilter === c
                  ? "bg-brand text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlyLow((v) => !v)}
          className={`ml-auto rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            onlyLow ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {onlyLow ? "⚠ Só estoque baixo" : "Ver estoque baixo"}
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div className="py-16 text-center text-gray-500">Carregando...</div>
      )}

      {!loading && error && (
        <Card className="py-10 text-center text-red-600">{error}</Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card className="py-12 text-center text-gray-500">
          {items.length === 0
            ? "Nenhum item cadastrado ainda."
            : "Nenhum item corresponde aos filtros selecionados."}
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const status = stockStatus(item);
            const borderCls =
              status === "out" ? "border-red-200 bg-red-50"
              : status === "low" ? "border-yellow-200 bg-yellow-50"
              : "border-gray-200 bg-white";

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${borderCls}`}
              >
                {/* Top */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{item.name}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <CategoryBadge cat={item.category} />
                      {item.location && (
                        <span className="text-[11px] text-gray-400">{item.location}</span>
                      )}
                    </div>
                  </div>
                  {status !== "ok" && (
                    <span className="flex-shrink-0 text-lg" title={status === "out" ? "Sem estoque" : "Estoque baixo"}>
                      {status === "out" ? "🔴" : "⚠️"}
                    </span>
                  )}
                </div>

                {/* Quantity */}
                <div className="mb-3">
                  <QuantityBadge item={item} />
                  {item.minQuantity > 0 && (
                    <p className="mt-1 text-xs text-gray-500">Mínimo: {qty_(item.minQuantity)} {item.unit}</p>
                  )}
                </div>

                {item.notes && (
                  <p className="mb-3 text-xs text-gray-500 line-clamp-1">{item.notes}</p>
                )}

                {/* Actions */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setModal({ type: "movement", item, movType: "ENTRADA" })}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
                  >
                    ↑ Entrada
                  </button>
                  <button
                    onClick={() => setModal({ type: "movement", item, movType: "SAIDA" })}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                  >
                    ↓ Baixa
                  </button>
                  <button
                    onClick={() => setModal({ type: "history", item })}
                    className="flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    title="Histórico"
                  >
                    ≡
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setModal({ type: "item-form", item })}
                        className="flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                        title="Editar"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
                        title="Excluir"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal?.type === "movement" && (
        <MovementModal
          item={modal.item}
          type={modal.movType}
          onClose={() => setModal(null)}
          onDone={updateItem}
        />
      )}
      {modal?.type === "history" && (
        <HistoryModal item={modal.item} onClose={() => setModal(null)} />
      )}
      {modal?.type === "item-form" && (
        <ItemModal
          initial={modal.item}
          onClose={() => setModal(null)}
          onDone={modal.item ? updateItem : addItem}
        />
      )}
    </div>
  );
}
