import { useEffect, useState, type FormEvent } from "react";
import { marketingApi } from "../api/marketing";
import { usersApi } from "../api/users";
import { ApiError } from "../api/client";
import type { Campaign, CampaignStatus, MarketingChannel, TaskUserRef } from "../types";
import { CAMPAIGN_STATUS_LABELS, MARKETING_CHANNEL_LABELS } from "../types";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { MarketingSubNav } from "../components/marketing/MarketingSubNav";

const CHANNEL_OPTIONS = Object.entries(MARKETING_CHANNEL_LABELS) as [MarketingChannel, string][];
const STATUS_OPTIONS = Object.entries(CAMPAIGN_STATUS_LABELS) as [CampaignStatus, string][];

const STATUS_BADGE_CLASS: Record<CampaignStatus, string> = {
  PLANEJAMENTO: "bg-gray-100 text-gray-600",
  EM_ANDAMENTO: "bg-brand/10 text-brand-dark",
  PAUSADA: "bg-amber-100 text-amber-700",
  CONCLUIDA: "bg-green-100 text-green-700",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function MarketingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<TaskUserRef[]>([]);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [channel, setChannel] = useState<MarketingChannel>("REDES_SOCIAIS");
  const [status, setStatus] = useState<CampaignStatus>("PLANEJAMENTO");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function reload() {
    marketingApi.listCampaigns().then(setCampaigns);
  }

  useEffect(() => {
    reload();
    usersApi.directory().then(setUsers).catch(() => setUsers([]));
  }, []);

  function startEdit(c: Campaign) {
    setEditingId(c.id);
    setName(c.name);
    setObjective(c.objective ?? "");
    setChannel(c.channel);
    setStatus(c.status);
    setStartDate(c.startDate ? c.startDate.slice(0, 10) : "");
    setEndDate(c.endDate ? c.endDate.slice(0, 10) : "");
    setBudget(c.budget != null ? String(c.budget) : "");
    setNotes(c.notes ?? "");
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setObjective("");
    setChannel("REDES_SOCIAIS");
    setStatus("PLANEJAMENTO");
    setStartDate("");
    setEndDate("");
    setBudget("");
    setNotes("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = {
        name,
        objective: objective || null,
        channel,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        budget: budget ? Number(budget) : null,
        notes: notes || null,
      };
      if (editingId) {
        await marketingApi.updateCampaign(editingId, data);
      } else {
        await marketingApi.createCampaign(data);
      }
      resetForm();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar a campanha");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Campaign) {
    if (!confirm(`Excluir a campanha "${c.name}"?`)) return;
    try {
      await marketingApi.deleteCampaign(c.id);
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível excluir a campanha");
    }
  }

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-gray-900">Marketing</h1>
      <p className="mb-4 text-sm text-gray-500">Campanhas</p>
      <MarketingSubNav />

      <form
        onSubmit={handleSubmit}
        className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-white dark:bg-gray-900 p-5 shadow-sm"
      >
        <input
          required
          placeholder="Nome da campanha"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <textarea
          placeholder="Objetivo (opcional)"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as MarketingChannel)}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
        >
          {CHANNEL_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CampaignStatus)}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div>
          <label className="text-xs text-gray-500">Início</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Fim</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Orçamento (opcional)"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <textarea
          placeholder="Notas (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {error && <p className="col-span-2 text-sm text-brand-dark">{error}</p>}
        <div className="col-span-2 flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : editingId ? "Salvar alterações" : "Criar campanha"}
          </Button>
          {editingId && (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-2.5">
        {campaigns.map((c) => (
          <Card key={c.id} className="flex items-start justify-between p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">{c.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[c.status]}`}>
                  {CAMPAIGN_STATUS_LABELS[c.status]}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {MARKETING_CHANNEL_LABELS[c.channel]}
                {c.startDate && ` · ${formatDate(c.startDate)}`}
                {c.endDate && ` a ${formatDate(c.endDate)}`}
                {c.budget != null && ` · ${formatCurrency(c.budget)}`}
                {` · ${c._count.contentItems} peça(s)`}
              </p>
              {c.objective && <p className="mt-1 text-xs text-gray-500">{c.objective}</p>}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button variant="secondary" onClick={() => startEdit(c)}>
                Editar
              </Button>
              <Button variant="danger" onClick={() => handleDelete(c)}>
                Excluir
              </Button>
            </div>
          </Card>
        ))}
        {campaigns.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">Nenhuma campanha cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
