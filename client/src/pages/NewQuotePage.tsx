import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { productsApi } from "../api/products";
import { quotesApi, type QuoteItemInput } from "../api/quotes";
import { ApiError } from "../api/client";
import type { IssuingCompany, Product } from "../types";
import { ISSUING_COMPANY_LABELS } from "../types";
import { Button } from "../components/common/Button";

interface ItemRow extends QuoteItemInput {
  localId: string;
}

function emptyRow(): ItemRow {
  return {
    localId: crypto.randomUUID(),
    productId: null,
    productName: "",
    specifications: "",
    quantity: 1,
    unitPrice: 0,
  };
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function NewQuotePage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [issuingCompany, setIssuingCompany] = useState<IssuingCompany>("GRAFINORTE");
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    productsApi.list().then(setProducts);
  }, []);

  function updateItem(localId: string, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function selectProduct(localId: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateItem(localId, { productId: null, productName: "", specifications: "" });
      return;
    }
    updateItem(localId, {
      productId: product.id,
      productName: product.name,
      specifications: product.specifications,
      unitPrice: product.unitPrice ?? 0,
    });
  }

  function addRow() {
    setItems((rows) => [...rows, emptyRow()]);
  }

  function removeRow(localId: string) {
    setItems((rows) => (rows.length > 1 ? rows.filter((r) => r.localId !== localId) : rows));
  }

  const grandTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((i) => i.productName.trim());
    if (!validItems.length) {
      setError("Adicione ao menos um item com produto selecionado");
      return;
    }

    setSubmitting(true);
    try {
      const quote = await quotesApi.create({
        issuingCompany,
        clientName,
        clientContact: clientContact || null,
        validUntil: validUntil || null,
        notes: notes || null,
        items: validItems.map(({ localId, ...rest }) => rest),
      });
      window.open(quotesApi.pdfUrl(quote.id), "_blank");
      navigate("/orcamentos");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o orçamento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-gray-900">Novo orçamento</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700">Empresa emissora</label>
            <select
              value={issuingCompany}
              onChange={(e) => setIssuingCompany(e.target.value as IssuingCompany)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            >
              {Object.entries(ISSUING_COMPANY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Validade (opcional)</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Cliente</label>
            <input
              required
              placeholder="Nome do cliente/candidato"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Contato (opcional)</label>
            <input
              placeholder="Telefone ou email"
              value={clientContact}
              onChange={(e) => setClientContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Itens</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.localId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="mb-2 grid grid-cols-12 gap-2">
                  <select
                    value={item.productId ?? ""}
                    onChange={(e) => selectProduct(item.localId, e.target.value)}
                    className="col-span-5 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  >
                    <option value="">Selecione um produto</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.localId, { quantity: Number(e.target.value) || 1 })
                    }
                    placeholder="Qtd"
                    className="col-span-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(item.localId, { unitPrice: Number(e.target.value) || 0 })
                    }
                    placeholder="Valor unit."
                    className="col-span-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  />
                  <div className="col-span-2 flex items-center justify-end text-sm font-medium text-gray-700">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    className="col-span-1"
                    onClick={() => removeRow(item.localId)}
                  >
                    ×
                  </Button>
                </div>
                <textarea
                  value={item.specifications}
                  onChange={(e) => updateItem(item.localId, { specifications: e.target.value })}
                  placeholder="Especificações"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" className="mt-3" onClick={addRow}>
            + Adicionar item
          </Button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Observações (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <span className="text-lg font-semibold text-gray-900">
            Total: {formatCurrency(grandTotal)}
          </span>
          {error && <p className="text-sm text-brand-dark">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Gerando..." : "Salvar e gerar PDF"}
          </Button>
        </div>
      </form>
    </div>
  );
}
