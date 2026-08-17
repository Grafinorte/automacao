import { useEffect, useState, type FormEvent } from "react";
import { productsApi } from "../api/products";
import { ApiError } from "../api/client";
import type { Product } from "../types";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";

export function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function reload() {
    productsApi.list(true).then(setProducts);
  }

  useEffect(reload, []);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setName(p.name);
    setSpecifications(p.specifications);
    setUnitPrice(p.unitPrice != null ? String(p.unitPrice) : "");
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setSpecifications("");
    setUnitPrice("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = {
        name,
        specifications,
        unitPrice: unitPrice ? Number(unitPrice) : null,
      };
      if (editingId) {
        await productsApi.update(editingId, data);
      } else {
        await productsApi.create(data);
      }
      resetForm();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o produto");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(p: Product) {
    await productsApi.update(p.id, { active: !p.active });
    reload();
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Excluir "${p.name}" do catálogo?`)) return;
    await productsApi.remove(p.id);
    reload();
  }

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-gray-900">Catálogo de Produtos</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-white dark:bg-gray-900 p-5 shadow-sm"
      >
        <input
          required
          placeholder="Nome do produto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <textarea
          required
          placeholder="Especificações (uma por linha, ex: Formato: 70 × 100 mm)"
          value={specifications}
          onChange={(e) => setSpecifications(e.target.value)}
          rows={3}
          className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Preço unitário padrão (opcional)"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {error && <p className="col-span-2 text-sm text-brand-dark">{error}</p>}
        <div className="col-span-2 flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar produto"}
          </Button>
          {editingId && (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-2.5">
        {products.map((p) => (
          <Card
            key={p.id}
            className={`flex items-start justify-between p-4 ${!p.active ? "bg-gray-50 opacity-60" : ""}`}
          >
            <div>
              <p className="font-medium text-gray-900">{p.name}</p>
              <p className="whitespace-pre-line text-xs text-gray-500">{p.specifications}</p>
              {p.unitPrice != null && (
                <p className="mt-1 text-xs text-gray-600">
                  Preço padrão: R$ {p.unitPrice.toFixed(2)}
                </p>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button variant="secondary" onClick={() => startEdit(p)}>
                Editar
              </Button>
              <Button variant="secondary" onClick={() => toggleActive(p)}>
                {p.active ? "Desativar" : "Ativar"}
              </Button>
              <Button variant="danger" onClick={() => handleDelete(p)}>
                Excluir
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
