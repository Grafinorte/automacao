import { useState, type FormEvent } from "react";
import type { Campaign, ContentItem, MarketingChannel, TaskUserRef } from "../../types";
import { MARKETING_CHANNEL_LABELS } from "../../types";
import { Button } from "../common/Button";

export interface ContentFormValues {
  title: string;
  type: string;
  channel: MarketingChannel;
  scheduledDate: string;
  campaignId: string;
  assigneeId: string;
  notes: string;
}

const CHANNEL_OPTIONS = Object.entries(MARKETING_CHANNEL_LABELS) as [MarketingChannel, string][];

export function ContentDetailModal({
  item,
  campaigns,
  users,
  onClose,
  onSave,
  onDelete,
}: {
  item: ContentItem | "new";
  campaigns: Campaign[];
  users: TaskUserRef[];
  onClose: () => void;
  onSave: (values: ContentFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const isNew = item === "new";
  const [values, setValues] = useState<ContentFormValues>(
    isNew
      ? { title: "", type: "", channel: "REDES_SOCIAIS", scheduledDate: "", campaignId: "", assigneeId: "", notes: "" }
      : {
          title: item.title,
          type: item.type,
          channel: item.channel,
          scheduledDate: item.scheduledDate ? item.scheduledDate.slice(0, 10) : "",
          campaignId: item.campaign?.id ?? "",
          assigneeId: item.assignee?.id ?? "",
          notes: item.notes ?? "",
        }
  );
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim() || !values.type.trim()) return;
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNew ? "Nova peça de conteúdo" : "Detalhes da peça"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Título</label>
              <input
                autoFocus
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <input
                  placeholder="Ex: Post, Banner, Vídeo..."
                  value={values.type}
                  onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Canal</label>
                <select
                  value={values.channel}
                  onChange={(e) => setValues((v) => ({ ...v, channel: e.target.value as MarketingChannel }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  {CHANNEL_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Campanha (opcional)</label>
                <select
                  value={values.campaignId}
                  onChange={(e) => setValues((v) => ({ ...v, campaignId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="">Nenhuma</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Responsável</label>
                <select
                  value={values.assigneeId}
                  onChange={(e) => setValues((v) => ({ ...v, assigneeId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  <option value="">Sem responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data agendada</label>
              <input
                type="date"
                value={values.scheduledDate}
                onChange={(e) => setValues((v) => ({ ...v, scheduledDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notas</label>
              <textarea
                value={values.notes}
                onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              {!isNew && onDelete ? (
                <Button type="button" variant="danger" onClick={onDelete}>
                  Excluir
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !values.title.trim() || !values.type.trim()}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
