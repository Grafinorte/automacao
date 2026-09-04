import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { servicesApi, fileToDataUrl } from "../api/services";
import type { ServiceOrder, ServiceLog } from "../api/services";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Permission helpers ───────────────────────────────────────────────────────
const WRITE_ROLES = ["ADMIN", "GERENTE", "SUPERVISOR", "ORCAMENTISTA", "COMERCIAL", "MEMBER"];
const WORKFLOW_ROLES = ["ADMIN", "DESIGN", "ARTE", "ARTE_FINAL"];
const QUEUE_ROLES = ["ADMIN", "PCP"];
const DELETE_ROLES = ["ADMIN", "PCP", "GERENTE", "SUPERVISOR"];
function canCreate(role: string) { return WRITE_ROLES.includes(role); }
function canWorkflow(role: string) { return WORKFLOW_ROLES.includes(role); }
function canQueue(role: string) { return QUEUE_ROLES.includes(role); }
function canDelete(role: string, userId: string, svc: ServiceOrder) {
  return DELETE_ROLES.includes(role) || svc.createdByUserId === userId;
}
function canEdit(role: string, userId: string, svc: ServiceOrder) {
  return (WRITE_ROLES.includes(role) || svc.createdByUserId === userId) && svc.status === "open";
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Section = "dashboard" | "servicos" | "logs" | "mockup" | "admin";
type StatusTab = "open" | "development" | "done" | "deleted";
type Period = "today" | "7d" | "30d" | "week" | "month" | "year" | "max";
interface PendingFile { name: string; dataUrl: string; }
interface ItemDraft { name: string; rollSizes: string[]; notes: string; rollInput: string; pendingFiles: PendingFile[]; existingAttachments: string[]; }
interface FormState {
  name: string; type: string; orderDate: string;
  seller: string; requester: string; clientPhone: string; items: ItemDraft[];
}
function emptyForm(userName?: string): FormState {
  return {
    name: "", type: "Criação de Faca",
    orderDate: new Date().toISOString().slice(0, 10),
    seller: "", requester: userName ?? "", clientPhone: "", items: [],
  };
}
function emptyItem(): ItemDraft {
  return { name: "", rollSizes: [], notes: "", rollInput: "", pendingFiles: [], existingAttachments: [] };
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────
function urgencyOf(svc: ServiceOrder): "ok" | "warn" | "late" {
  if (svc.status !== "open" && svc.status !== "development") return "ok";
  const ageMs = Date.now() - new Date(svc.updatedAt).getTime();
  if (ageMs > 48 * 3600_000) return "late";
  if (ageMs > 24 * 3600_000) return "warn";
  return "ok";
}
const DOT: Record<string, string> = {
  ok:   "bg-emerald-500",
  warn: "bg-amber-500",
  late: "bg-red-500",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje", "7d": "7 dias", "30d": "30 dias",
  week: "Semana", month: "Mês", year: "Ano", max: "Máx.",
};

function filterByPeriod(services: ServiceOrder[], period: Period) {
  const now = new Date();
  const start = new Date(now);
  if (period === "today") { start.setHours(0, 0, 0, 0); }
  else if (period === "7d") { start.setDate(start.getDate() - 7); }
  else if (period === "30d") { start.setDate(start.getDate() - 30); }
  else if (period === "week") { start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0); }
  else if (period === "month") { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (period === "year") { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  else return services;
  return services.filter((s) => new Date(s.createdAt) >= start);
}

function getChartData(services: ServiceOrder[], period: Period) {
  const now = new Date();
  if (period === "today") {
    const buckets = Array.from({ length: 24 }, (_, i) => ({ label: `${String(i).padStart(2, "0")}h`, count: 0 }));
    for (const s of services) {
      const d = new Date(s.createdAt);
      if (d.toDateString() === now.toDateString()) buckets[d.getHours()].count++;
    }
    return buckets;
  }
  if (period === "7d" || period === "week") {
    const buckets: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      buckets.push({ label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), count: 0 });
      const end = new Date(d); end.setDate(end.getDate() + 1);
      for (const s of services) {
        const cd = new Date(s.createdAt);
        if (cd >= d && cd < end) buckets[buckets.length - 1].count++;
      }
    }
    return buckets;
  }
  if (period === "30d" || period === "month") {
    const buckets: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setDate(end.getDate() + 1);
      const label = i % 5 === 0 ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
      let count = 0;
      for (const s of services) {
        const cd = new Date(s.createdAt);
        if (cd >= d && cd < end) count++;
      }
      buckets.push({ label, count });
    }
    return buckets;
  }
  // year or max
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const buckets = months.map((label) => ({ label, count: 0 }));
  for (const s of services) {
    const d = new Date(s.createdAt);
    if (period === "year" && d.getFullYear() !== now.getFullYear()) continue;
    buckets[d.getMonth()].count++;
  }
  return buckets;
}

// ─── TYPE BADGE ───────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  let cls = "bg-[#f3f3f5] text-[#46464a] border-[rgba(199,198,202,0.5)] dark:bg-[#222426] dark:text-[#a0a0a4] dark:border-white/10";
  if (t.includes("mockup")) cls = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/50";
  else if (t.includes("faca")) cls = "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/50";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[12px] font-medium ${cls}`}>
      {type}
    </span>
  );
}

// ─── LOG ACTION BADGE ─────────────────────────────────────────────────────────
function LogBadge({ action }: { action: string }) {
  const a = action.toLowerCase();
  let label = action;
  let cls = "bg-[#f3f3f5] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]";
  if (a.includes("created") || a === "created") { label = "Criação"; cls = "bg-[#f3f3f5] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]"; }
  else if (a.includes("development")) { label = "Desenvolvimento"; cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"; }
  else if (a.includes("done")) { label = "Conclusão"; cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"; }
  else if (a.includes("attachment") || a.includes("upload")) { label = "Anexo"; cls = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"; }
  else if (a.includes("deleted")) { label = "Exclusão"; cls = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"; }
  else if (a.includes("updated")) { label = "Edição"; cls = "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"; }
  else if (a.includes("queue")) { label = "Fila"; cls = "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"; }
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
  );
}

// ─── ICON BUTTONS ─────────────────────────────────────────────────────────────
function IconBtn({ onClick, title, className, children }: { onClick: () => void; title: string; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(199,198,202,0.5)] text-[#46464a] transition hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-[#222426] ${className ?? ""}`}>
      {children}
    </button>
  );
}
const PencilIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
  </svg>
);
const PlayIcon = () => (
  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const TrashIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);
const CheckIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);
const LockIcon = () => (
  <svg className="h-3.5 w-3.5 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);

const DragHandleIcon = () => (
  <svg className="h-4 w-4 text-[#a0a0a4]" viewBox="0 0 20 20" fill="currentColor">
    <circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/>
    <circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/>
    <circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/>
  </svg>
);

// ─── SERVICE MODAL ────────────────────────────────────────────────────────────
function ServiceModal({ initial, onClose, onSave, userName, isDuplicate }: {
  initial: ServiceOrder | null; onClose: () => void;
  onSave: (form: FormState) => Promise<void>; userName: string; isDuplicate?: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return emptyForm(userName);
    return {
      name: initial.name, type: initial.type, orderDate: initial.orderDate,
      seller: initial.seller, requester: initial.requester, clientPhone: initial.clientPhone ?? "",
      items: initial.items.map((it) => ({ name: it.name, rollSizes: [...it.rollSizes], notes: it.notes, rollInput: "", pendingFiles: [], existingAttachments: [...it.attachments] })),
    };
  });
  const [saving, setSaving] = useState(false);

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setForm((f) => { const items = [...f.items]; items[idx] = { ...items[idx], ...patch }; return { ...f, items }; });
  }
  function addRollSize(idx: number) {
    const val = form.items[idx].rollInput.trim(); if (!val) return;
    setItem(idx, { rollSizes: [...form.items[idx].rollSizes, val], rollInput: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true); try { await onSave(form); } finally { setSaving(false); }
  }

  const inputCls = "w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none focus:border-[#005cba] focus:ring-2 focus:ring-[#005cba]/10 dark:bg-[#23252a] dark:text-white dark:border-white/10";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <h2 className="text-[17px] font-semibold dark:text-white">{isDuplicate ? "Duplicar serviço" : initial ? "Editar serviço" : "Adicionar serviço"}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#77767b] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome do serviço *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Pedido do cliente Alfa" className={inputCls} autoFocus />
              </div>
              <div>
                <label className={labelCls}>Tipo de serviço</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
                  <option value="">Selecione</option>
                  {["Criação de Faca", "Mockup", "Outros"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data do pedido</label>
                <input type="date" value={form.orderDate} onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Solicitante</label>
                <input value={form.requester} onChange={(e) => setForm((f) => ({ ...f, requester: e.target.value }))} placeholder="Administrador" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Vendedor</label>
                <input value={form.seller} onChange={(e) => setForm((f) => ({ ...f, seller: e.target.value }))} placeholder="Nome do vendedor" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>WhatsApp p/ aviso (orçamentista)</label>
                <input value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                  placeholder="554334207765 (apenas números com DDI)" className={inputCls} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold dark:text-white">Serviços do pedido</p>
                  <p className="text-[12px] text-[#77767b]">Adicione os serviços, tamanhos de bobina e todas as informações necessárias.</p>
                </div>
              </div>
              {form.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[rgba(199,198,202,0.5)] py-6 text-center text-[13px] text-[#77767b]">
                  Nenhum serviço adicionado ao pedido.
                </div>
              ) : (
                <div className="space-y-3">
                  {form.items.map((item, idx) => {
                    const fileRef = { current: null as HTMLInputElement | null };
                    return (
                    <div key={idx} className="rounded-xl border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] dark:bg-[#222426] dark:border-white/8 overflow-hidden">
                      {/* Item header */}
                      <div className="flex items-center justify-between border-b border-[rgba(199,198,202,0.3)] bg-white px-4 py-2.5 dark:bg-[#1c1e22] dark:border-white/8">
                        <span className="text-[12px] font-semibold text-[#77767b]">Serviço {idx + 1}</span>
                        <button type="button" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600">
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="p-4 space-y-3">
                        {/* Nome */}
                        <div>
                          <label className="block text-[11px] font-semibold text-[#77767b] mb-1">Nome</label>
                          <input placeholder="Nome deste serviço" value={item.name} onChange={(e) => setItem(idx, { name: e.target.value })} className={inputCls} />
                        </div>
                        {/* Tamanhos de bobina */}
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="text-[11px] font-semibold text-[#77767b]">Tamanho da bobina</label>
                            <span className="text-[10px] text-red-400">Obrigatório</span>
                          </div>
                          {item.rollSizes.map((r, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-1.5 mb-1">
                              <input value={r} onChange={(e) => {
                                const updated = [...item.rollSizes]; updated[rIdx] = e.target.value;
                                setItem(idx, { rollSizes: updated });
                              }} className="flex-1 rounded-lg border border-[rgba(199,198,202,0.3)] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#005cba] dark:bg-[#1c1e22] dark:text-white dark:border-white/10" />
                              <button type="button" onClick={() => setItem(idx, { rollSizes: item.rollSizes.filter((_, i) => i !== rIdx) })}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(199,198,202,0.3)] text-[#77767b] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                          <div className="flex gap-1.5 mt-1">
                            <input placeholder="Ex.: 1200 mm" value={item.rollInput}
                              onChange={(e) => setItem(idx, { rollInput: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRollSize(idx); } }}
                              className="flex-1 rounded-lg border border-[rgba(199,198,202,0.3)] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#005cba] dark:bg-[#1c1e22] dark:text-white dark:border-white/10" />
                            <button type="button" onClick={() => addRollSize(idx)}
                              className="rounded-lg border border-[rgba(199,198,202,0.3)] px-3 py-1.5 text-[11px] font-semibold text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                              + Adicionar tamanho
                            </button>
                          </div>
                        </div>
                        {/* Observações */}
                        <div>
                          <label className="block text-[11px] font-semibold text-[#77767b] mb-1">Observações</label>
                          <textarea rows={3} placeholder="Informe todos os detalhes deste serviço" value={item.notes}
                            onChange={(e) => setItem(idx, { notes: e.target.value })}
                            className="w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10 resize-none" />
                        </div>
                        {/* Imagens e PDFs */}
                        <div>
                          <label className="block text-[11px] font-semibold text-[#77767b] mb-2">Imagens e PDFs</label>
                          {/* Arquivos já salvos */}
                          {item.existingAttachments.length > 0 && (
                            <div className="mb-2 space-y-1">
                              {item.existingAttachments.map((url, aIdx) => {
                                const raw = url.split("/").pop() ?? url;
                                const displayName = raw.replace(/^\d+_/, "");
                                return (
                                  <div key={aIdx} className="flex items-center gap-2 rounded-lg border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-1.5 text-[12px] dark:bg-[#23252a] dark:border-white/10">
                                    <svg className="h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                    <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-[#005cba] hover:underline dark:text-blue-400">{displayName}</a>
                                    <button type="button" title="Remover arquivo"
                                      onClick={() => setItem(idx, { existingAttachments: item.existingAttachments.filter((_, i) => i !== aIdx) })}
                                      className="text-[#77767b] hover:text-red-500 text-base leading-none">×</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <input type="file" accept="image/*,.pdf" multiple className="hidden"
                              ref={(el) => { fileRef.current = el; }}
                              onChange={async (e) => {
                                const files = Array.from(e.target.files ?? []);
                                const loaded: PendingFile[] = [];
                                for (const f of files) {
                                  const dataUrl = await fileToDataUrl(f);
                                  loaded.push({ name: f.name, dataUrl });
                                }
                                setItem(idx, { pendingFiles: [...item.pendingFiles, ...loaded] });
                                e.target.value = "";
                              }} />
                            <button type="button" onClick={() => fileRef.current?.click()}
                              className="flex items-center gap-2 rounded-lg border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-[12px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:bg-[#1c1e22] dark:text-[#a0a0a4] dark:border-white/10 dark:hover:bg-[#222426]">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
                              Adicionar arquivo
                            </button>
                            {item.pendingFiles.length > 0 && (
                              <span className="text-[11px] text-[#77767b]">{item.pendingFiles.length} novo(s) para enviar</span>
                            )}
                          </div>
                          {item.pendingFiles.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {item.pendingFiles.map((f, fIdx) => (
                                <div key={fIdx} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[12px] dark:bg-[#1c1e22]">
                                  <svg className="h-4 w-4 flex-shrink-0 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                  <span className="flex-1 truncate text-[#1a1c1d] dark:text-white">{f.name}</span>
                                  <button type="button" onClick={() => setItem(idx, { pendingFiles: item.pendingFiles.filter((_, i) => i !== fIdx) })}
                                    className="text-[#77767b] hover:text-red-500">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="mt-1 text-[11px] text-[#77767b]">Os arquivos serão salvos na pasta deste pedido.</p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
              <button type="button"
                onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-[rgba(199,198,202,0.5)] px-3 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426] dark:border-white/10">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Adicionar serviço
              </button>
            </div>

            <div className="flex justify-end gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4 dark:border-white/8">
              <button type="button" onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.5)] px-4 py-2 text-sm text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                Cancelar
              </button>
              <button type="submit" disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-[#030304] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a1c1d] disabled:opacity-50 dark:bg-white dark:text-[#030304]">
                <CheckIcon />
                {saving ? "Salvando..." : "Salvar serviço"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── START DEV MODAL ──────────────────────────────────────────────────────────
function StartDevModal({ svc, users, defaultDevUserId, onClose, onConfirm }: {
  svc: ServiceOrder; users: { id: string; name: string; role?: string }[];
  defaultDevUserId?: string;
  onClose: () => void; onConfirm: (devUserId: string) => Promise<void>;
}) {
  const [devUserId, setDevUserId] = useState(() => {
    if (svc.developerUserId) return svc.developerUserId;
    const inList = users.some((u) => u.id === defaultDevUserId);
    return inList ? (defaultDevUserId ?? "") : "";
  });
  const [saving, setSaving] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!devUserId) return;
    setSaving(true); try { await onConfirm(devUserId); } finally { setSaving(false); }
  }
  const inputCls = "w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
        <div className="border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <h2 className="text-[16px] font-semibold dark:text-white">Iniciar Desenvolvimento</h2>
          <p className="mt-0.5 text-[12px] text-[#77767b]">#{String(svc.serviceNumber).padStart(4, "0")} — {svc.name}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] mb-1">Desenvolvedor *</label>
            <select value={devUserId} onChange={(e) => setDevUserId(e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-[rgba(199,198,202,0.5)] px-4 py-2 text-sm text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">Cancelar</button>
            <button type="submit" disabled={saving || !devUserId}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
              {saving ? "Salvando..." : "Iniciar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── COMPLETE MODAL ───────────────────────────────────────────────────────────
function CompleteModal({ svc, onClose, onConfirm }: {
  svc: ServiceOrder; onClose: () => void;
  onConfirm: (payload: { message: string; itemCompletions: Array<{ id: string; completed: boolean; completionNote: string }> }) => Promise<void>;
}) {
  const [message, setMessage] = useState(svc.completionMessage ?? "");
  const [items, setItems] = useState(() =>
    svc.items.map((it) => ({
      id: it.id,
      completed: it.completed,
      completionNote: it.completionNote,
      pendingFiles: [] as PendingFile[],
    }))
  );
  const [saving, setSaving] = useState(false);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const completedCount = items.filter((it) => it.completed).length;

  function patchItem(idx: number, patch: Partial<typeof items[0]>) {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      for (let i = 0; i < items.length; i++) {
        for (const f of items[i].pendingFiles) {
          await servicesApi.uploadAttachment(svc.id, {
            itemId: items[i].id,
            fileName: f.name,
            dataUrl: f.dataUrl,
            type: "completion",
          });
        }
      }
      const itemCompletions = items.map(({ id, completed, completionNote }) => ({ id, completed, completionNote }));
      await onConfirm({ message, itemCompletions });
    } finally {
      setSaving(false);
    }
  }

  const attachIconCls = "h-4 w-4 flex-shrink-0 text-[#46464a] dark:text-[#a0a0a4]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <h2 className="text-[17px] font-semibold text-[#1a1c1d] dark:text-white">Concluir serviço</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#77767b] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Service info card */}
            <div className="rounded-xl border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] p-4 dark:bg-[#222426] dark:border-white/8">
              <p className="text-[15px] font-bold text-[#1a1c1d] dark:text-white">{svc.name}</p>
              <p className="text-[12px] text-[#77767b] mt-0.5">ID: {String(svc.serviceNumber).padStart(4, "0")}</p>
              {svc.seller && <p className="text-[12px] text-[#77767b]">Vendedor: {svc.seller}</p>}
            </div>

            {/* Per-item cards */}
            {svc.items.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Serviços do pedido</h3>
                  <span className="text-[12px] text-[#77767b]">{completedCount} de {items.length} serão concluídos</span>
                </div>
                <div className="space-y-3">
                  {svc.items.map((svcItem, idx) => {
                    const item = items[idx];
                    return (
                      <div key={svcItem.id} className="overflow-hidden rounded-xl border border-[rgba(199,198,202,0.3)] bg-white dark:bg-[#1c1e22] dark:border-white/8">
                        {/* Item header */}
                        <div className="flex items-start justify-between gap-3 border-b border-[rgba(199,198,202,0.3)] px-4 py-3 dark:border-white/8">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b]">
                              ITEM {String(idx + 1).padStart(2, "0")}
                            </p>
                            <p className="text-[13px] font-bold uppercase text-[#1a1c1d] dark:text-white">
                              {svcItem.name}
                              {svcItem.rollSizes.length > 0 && ` – ${svcItem.rollSizes.join(", ")}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => patchItem(idx, { completed: !item.completed })}
                            className={`mt-0.5 flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                              item.completed
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                                : "border-[rgba(199,198,202,0.5)] bg-[#f3f3f5] text-[#77767b] dark:border-white/10 dark:bg-[#222426] dark:text-[#a0a0a4]"
                            }`}>
                            {item.completed ? <CheckIcon /> : (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <circle cx="12" cy="12" r="9" />
                              </svg>
                            )}
                            Produzido
                          </button>
                        </div>
                        {/* Item body: two columns */}
                        <div className="grid grid-cols-2 gap-4 p-4">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-[#77767b]">Observação da conclusão</label>
                            <textarea
                              rows={3}
                              placeholder="Observação desta conclusão (opcional)"
                              value={item.completionNote}
                              onChange={(e) => patchItem(idx, { completionNote: e.target.value })}
                              className="w-full resize-none rounded-xl border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-2 text-[12px] outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-[#77767b]">PDF da faca</label>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              multiple
                              className="hidden"
                              ref={(el) => { fileRefs.current[idx] = el; }}
                              onChange={async (e) => {
                                const files = Array.from(e.target.files ?? []);
                                const loaded: PendingFile[] = [];
                                for (const f of files) {
                                  const dataUrl = await fileToDataUrl(f);
                                  loaded.push({ name: f.name, dataUrl });
                                }
                                patchItem(idx, { pendingFiles: [...item.pendingFiles, ...loaded] });
                                e.target.value = "";
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => fileRefs.current[idx]?.click()}
                              className="flex items-center gap-2 rounded-lg border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-2 text-[12px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:bg-[#222426] dark:text-[#a0a0a4] dark:border-white/10">
                              <svg className={attachIconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
                              Selecionar arquivos
                            </button>
                            <p className="mt-1 text-[11px] text-[#77767b]">
                              {item.pendingFiles.length > 0 ? `${item.pendingFiles.length} arquivo(s) selecionado(s)` : "Nenhum arquivo selecionado"}
                            </p>
                            {item.pendingFiles.length > 0 && (
                              <div className="mt-0.5 space-y-0.5">
                                {item.pendingFiles.map((f, fIdx) => (
                                  <div key={fIdx} className="flex items-center gap-1 text-[11px] text-[#46464a] dark:text-[#a0a0a4]">
                                    <span className="flex-1 truncate">{f.name}</span>
                                    <button type="button" onClick={() => patchItem(idx, { pendingFiles: item.pendingFiles.filter((_, i) => i !== fIdx) })} className="text-[#77767b] hover:text-red-500">×</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="mt-1 text-[10px] text-[#77767b]">Os arquivos ficarão vinculados somente a este item.</p>
                            {svcItem.completionAttachments.length > 0 ? (
                              <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">{svcItem.completionAttachments.length} arquivo(s) de conclusão anexado(s).</p>
                            ) : (
                              <p className="mt-0.5 text-[10px] text-[#77767b]">Nenhum arquivo de conclusão anexado.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Developer message */}
            <div>
              <label className="mb-2 block text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Mensagem do desenvolvedor</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Informe o que foi concluído e observações importantes para o orçamento."
                className="w-full resize-none rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4 dark:border-white/8">
              <a
                href={`https://wa.me/${(localStorage.getItem("orcamentista_whatsapp") ?? "554334207765").replace(/\D/g, "")}?text=${encodeURIComponent(buildCompletionWhatsappMessage(svc, message, items.map(({ id, completed, completionNote }) => ({ id, completed, completionNote }))))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#25D366]/60 bg-[#25D366]/10 px-4 py-2 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/20 dark:text-[#25D366] dark:border-[#25D366]/30">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                Avisar
              </a>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-[rgba(199,198,202,0.5)] px-4 py-2 text-sm text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? "Salvando..." : "Concluir serviço"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── DELETE MODAL ─────────────────────────────────────────────────────────────
function DeleteModal({ svc, onClose, onConfirm }: {
  svc: ServiceOrder; onClose: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(""); const [saving, setSaving] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); try { await onConfirm(reason); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
        <div className="border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <h2 className="text-[16px] font-semibold text-red-600 dark:text-red-400">Excluir Serviço</h2>
          <p className="mt-0.5 text-[12px] text-[#77767b]">#{String(svc.serviceNumber).padStart(4, "0")} — {svc.name}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] mb-1">Motivo</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Cancelado pelo cliente"
              className="w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm outline-none focus:border-red-500 dark:bg-[#23252a] dark:text-white dark:border-white/10" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-[rgba(199,198,202,0.5)] px-4 py-2 text-sm text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">Cancelar</button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {saving ? "Excluindo..." : "Confirmar exclusão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── UPLOAD MODAL ─────────────────────────────────────────────────────────────
function UploadModal({ svc, onClose, onUpload }: {
  svc: ServiceOrder; onClose: () => void;
  onUpload: (itemId: string | undefined, file: File, type: "service" | "completion") => Promise<void>;
}) {
  const [itemId, setItemId] = useState<string | undefined>(svc.items[0]?.id);
  const [fileType, setFileType] = useState<"service" | "completion">("service");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); try { await onUpload(itemId, file, fileType); onClose(); } finally { setUploading(false); }
  }
  const inputCls = "w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
        <div className="border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <h2 className="text-[16px] font-semibold dark:text-white">Upload de Arquivo</h2>
          <p className="mt-0.5 text-[12px] text-[#77767b]">#{String(svc.serviceNumber).padStart(4, "0")} — {svc.name}</p>
        </div>
        <div className="space-y-4 px-6 py-5">
          {svc.items.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] mb-1">Item</label>
              <select value={itemId ?? ""} onChange={(e) => setItemId(e.target.value || undefined)} className={inputCls}>
                {svc.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] mb-1">Tipo</label>
            <select value={fileType} onChange={(e) => setFileType(e.target.value as "service" | "completion")} className={inputCls}>
              <option value="service">Arquivo do serviço</option>
              <option value="completion">Arquivo de conclusão</option>
            </select>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-[rgba(199,198,202,0.5)] px-4 py-2 text-sm text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">Cancelar</button>
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-[#005cba] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0052a8] disabled:opacity-50">
              {uploading ? "Enviando..." : "Selecionar arquivo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SERVICE DETAIL MODAL ────────────────────────────────────────────────────
function ServiceDetailModal({ svc, logs, onClose }: {
  svc: ServiceOrder; logs: ServiceLog[]; onClose: () => void;
}) {
  const svcLogs = logs.filter((l) => l.serviceOrderId === svc.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function isImage(url: string) {
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
  }

  const statusLabels: Record<string, string> = {
    open: "Aberto", development: "Em desenvolvimento", done: "Concluído", deleted: "Excluído",
  };
  const statusColors: Record<string, string> = {
    open: "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300",
    development: "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300",
    done: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300",
    deleted: "text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 p-0">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-[#1c1e22] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
          <div>
            <h2 className="text-[17px] font-bold text-[#1a1c1d] dark:text-white">
              <span className="font-mono text-[#77767b]">#{String(svc.serviceNumber).padStart(4, "0")}</span>
              {" · "}{svc.name}
            </h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#77767b] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Metadata grid */}
          <div className="grid grid-cols-3 gap-0 rounded-xl border border-[rgba(199,198,202,0.3)] overflow-hidden dark:border-white/8">
            {[
              { label: "Status", value: <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColors[svc.status]}`}>{statusLabels[svc.status]}</span> },
              { label: "Tipo", value: svc.type },
              { label: "Data do pedido", value: fmtDate(svc.orderDate) },
              { label: "Cadastro", value: fmtDate(svc.createdAt) },
              { label: "Solicitante", value: svc.requester || "—" },
              { label: "Vendedor", value: svc.seller || "—" },
              { label: "Desenvolvedor", value: svc.developerUser?.name ?? "—" },
            ].map(({ label, value }, i) => (
              <div key={label} className={`p-3 ${i < 6 ? "border-b" : ""} ${i % 3 !== 2 ? "border-r" : ""} border-[rgba(199,198,202,0.3)] dark:border-white/8`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b] mb-0.5">{label}</p>
                <div className="text-[13px] font-medium text-[#1a1c1d] dark:text-white">{value}</div>
              </div>
            ))}
          </div>

          {/* Serviços do pedido */}
          {svc.items.length > 0 && (
            <div>
              <h3 className="mb-3 text-[14px] font-bold text-[#1a1c1d] dark:text-white">Serviços do pedido</h3>
              <div className="space-y-3">
                {svc.items.map((item, idx) => {
                  const allAttachments = [...item.attachments, ...item.completionAttachments];
                  return (
                    <div key={item.id} className="rounded-xl border border-[rgba(199,198,202,0.3)] overflow-hidden dark:border-white/8">
                      {/* Item header */}
                      <div className="flex items-center gap-4 border-b border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-4 py-3 dark:bg-[#222426] dark:border-white/8">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#1a1c1d] text-[13px] font-bold text-white dark:bg-white dark:text-[#1a1c1d]">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-[10px] text-[#77767b]">Serviço {idx + 1}</p>
                          <p className="text-[13px] font-bold text-[#1a1c1d] dark:text-white">{item.name}</p>
                        </div>
                        {item.completed && (
                          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Concluído</span>
                        )}
                      </div>
                      {/* Item body */}
                      <div className="grid grid-cols-2 gap-4 bg-white p-4 dark:bg-[#1c1e22]">
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold text-[#77767b]">Tamanhos da bobina</p>
                          {item.rollSizes.length > 0 ? (
                            <ul className="space-y-0.5">
                              {item.rollSizes.map((r, rIdx) => (
                                <li key={rIdx} className="flex items-center gap-2 text-[13px] text-[#1a1c1d] dark:text-white">
                                  <span className="text-[#77767b]">—</span> {r}
                                </li>
                              ))}
                            </ul>
                          ) : <p className="text-[12px] text-[#77767b]">Nenhum tamanho informado.</p>}
                        </div>
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold text-[#77767b]">Observações</p>
                          <p className="text-[13px] text-[#1a1c1d] dark:text-white whitespace-pre-wrap">{item.notes || "—"}</p>
                          {item.completionNote && (
                            <p className="mt-2 text-[12px] text-emerald-600 dark:text-emerald-400">Nota de conclusão: {item.completionNote}</p>
                          )}
                        </div>
                      </div>
                      {/* Attachments */}
                      <div className="border-t border-[rgba(199,198,202,0.3)] bg-white px-4 pb-4 dark:bg-[#1c1e22] dark:border-white/8">
                        <p className="mb-2 pt-3 text-[11px] font-semibold text-[#77767b]">Imagens e PDFs recebidos</p>
                        {allAttachments.length === 0 ? (
                          <p className="text-[12px] text-[#005cba]">Nenhuma imagem ou PDF anexado.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {allAttachments.map((url, uIdx) => {
                              const filename = url.split("/").pop() ?? url;
                              const displayName = filename.replace(/^\d+_/, "");
                              return isImage(url) ? (
                                <a key={uIdx} href={url} target="_blank" rel="noreferrer"
                                  className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[rgba(199,198,202,0.3)] dark:border-white/10">
                                  <img src={url} alt={displayName} className="h-full w-full object-cover" />
                                </a>
                              ) : (
                                <a key={uIdx} href={url} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1.5 rounded-lg border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] px-3 py-2 text-[12px] text-[#005cba] hover:bg-[#f0f5ff] dark:bg-[#222426] dark:border-white/10 dark:hover:bg-[#1a2535]">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                  {displayName}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Histórico */}
          <div>
            <h3 className="mb-3 text-[14px] font-bold text-[#1a1c1d] dark:text-white">Histórico</h3>
            {svcLogs.length === 0 ? (
              <p className="text-[13px] text-[#77767b]">Nenhum registro.</p>
            ) : (
              <div className="divide-y divide-[rgba(199,198,202,0.3)] dark:divide-white/8">
                {svcLogs.map((log) => (
                  <div key={log.id} className="flex items-start justify-between py-3">
                    <div className="flex items-start gap-3">
                      <LogBadge action={log.action} />
                      <div>
                        <p className="text-[13px] text-[#1a1c1d] dark:text-white">{log.summary}</p>
                        <p className="text-[11px] text-[#77767b]">{log.actor.name}</p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-[#77767b]">{fmtDateTime(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD SECTION ────────────────────────────────────────────────────────
function DashboardSection({ services }: { services: ServiceOrder[] }) {
  const [period, setPeriod] = useState<Period>("today");
  const filtered = filterByPeriod(services, period);
  const inDev = services.filter((s) => s.status === "development").length;
  const warn = services.filter((s) => urgencyOf(s) === "warn").length;
  const late = services.filter((s) => urgencyOf(s) === "late").length;
  const chartData = getChartData(filtered, period);

  const totalByType = {
    "Criação de Faca": filtered.filter((s) => s.type === "Criação de Faca").length,
    Mockup: filtered.filter((s) => s.type === "Mockup").length,
    Outros: filtered.filter((s) => !["Criação de Faca", "Mockup"].includes(s.type)).length,
  };
  const totalByStatus = {
    Abertos: filtered.filter((s) => s.status === "open").length,
    Desenvolvimento: filtered.filter((s) => s.status === "development").length,
    Concluídos: filtered.filter((s) => s.status === "done").length,
  };
  const maxType = Math.max(...Object.values(totalByType), 1);
  const maxStatus = Math.max(...Object.values(totalByStatus), 1);

  const periods: Period[] = ["today", "7d", "30d", "week", "month", "year", "max"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1c1d] dark:text-white">Visão geral</h1>
          <p className="text-[13px] text-[#77767b]">Acompanhe o volume de serviços e os prazos da equipe.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white p-1 shadow-sm dark:bg-[#1c1e22] dark:border-white/8">
          {periods.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                period === p ? "bg-[#1a1c1d] text-white dark:bg-white dark:text-[#1a1c1d]" : "text-[#77767b] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
              }`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total */}
        <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f3f5] dark:bg-[#222426]">
            <svg className="h-5 w-5 text-[#46464a] dark:text-[#a0a0a4]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Total no período</p>
          <p className="mt-1 text-[36px] font-bold leading-none text-[#1a1c1d] dark:text-white">{filtered.length}</p>
        </div>
        {/* Em desenvolvimento */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:bg-emerald-900/10 dark:border-emerald-800/50">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-800/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 16 16" fill="currentColor">
              <path d="M15.825.12a.5.5 0 0 1 .132.584c-1.53 3.43-4.743 8.17-7.095 10.64a6.1 6.1 0 0 1-2.373 1.534c-.018.227-.06.538-.16.868-.201.659-.667 1.479-1.708 1.74a8.1 8.1 0 0 1-3.078.132 4 4 0 0 1-.562-.135 1.4 1.4 0 0 1-.466-.247.7.7 0 0 1-.204-.288.62.62 0 0 1 .004-.443c.095-.245.316-.38.461-.452.394-.197.625-.453.867-.826.095-.144.184-.297.287-.472l.117-.198c.151-.255.326-.54.546-.848.528-.739 1.201-.925 1.746-.896q.19.012.348.048c.062-.172.142-.38.238-.608.261-.619.658-1.419 1.187-2.069 2.176-2.67 6.18-6.206 9.117-8.104a.5.5 0 0 1 .596.04M4.705 11.912a1.2 1.2 0 0 0-.419-.1c-.246-.013-.573.05-.879.479-.197.275-.355.532-.5.777l-.105.177c-.106.181-.213.362-.32.528a3.4 3.4 0 0 1-.76.861c.69.112 1.736.111 2.657-.12.559-.139.843-.569.993-1.06a3 3 0 0 0 .126-.75zm1.44.026c.12-.04.277-.1.458-.183a5.1 5.1 0 0 0 1.535-1.1c1.9-1.996 4.412-5.57 6.052-8.631-2.59 1.927-5.566 4.66-7.302 6.792-.442.543-.795 1.243-1.042 1.826-.121.288-.214.54-.275.72v.001l.575.575zm-4.973 3.04.007-.005zm3.582-3.043.002.001h-.002z"/>
            </svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Em desenvolvimento</p>
          <p className="mt-1 text-[36px] font-bold leading-none text-emerald-700 dark:text-emerald-300">{inDev}</p>
        </div>
        {/* Atenção 24h */}
        <div className={`rounded-2xl border p-5 ${warn > 0 ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800/50" : "border-[rgba(199,198,202,0.3)] bg-white dark:bg-[#1c1e22] dark:border-white/8"}`}>
          <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${warn > 0 ? "bg-amber-100 dark:bg-amber-800/30" : "bg-[#f3f3f5] dark:bg-[#222426]"}`}>
            <svg className={`h-5 w-5 ${warn > 0 ? "text-amber-600 dark:text-amber-400" : "text-[#46464a] dark:text-[#a0a0a4]"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          </div>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${warn > 0 ? "text-amber-700 dark:text-amber-400" : "text-[#77767b]"}`}>Atenção 24h</p>
          <p className={`mt-1 text-[36px] font-bold leading-none ${warn > 0 ? "text-amber-600 dark:text-amber-300" : "text-[#1a1c1d] dark:text-white"}`}>{warn}</p>
        </div>
        {/* Atrasados 48h */}
        <div className={`rounded-2xl border p-5 ${late > 0 ? "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800/50" : "border-[rgba(199,198,202,0.3)] bg-white dark:bg-[#1c1e22] dark:border-white/8"}`}>
          <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${late > 0 ? "bg-red-100 dark:bg-red-800/30" : "bg-[#f3f3f5] dark:bg-[#222426]"}`}>
            <svg className={`h-5 w-5 ${late > 0 ? "text-red-600 dark:text-red-400" : "text-[#46464a] dark:text-[#a0a0a4]"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          </div>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${late > 0 ? "text-red-700 dark:text-red-400" : "text-[#77767b]"}`}>Atrasados 48h</p>
          <p className={`mt-1 text-[36px] font-bold leading-none ${late > 0 ? "text-red-600 dark:text-red-300" : "text-[#1a1c1d] dark:text-white"}`}>{late}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Volume de serviços</h2>
            <p className="text-[11px] text-[#77767b]">{PERIOD_LABELS[period]}</p>
          </div>
          <span className="text-[12px] text-[#77767b]">{filtered.length} itens no período</span>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(199,198,202,0.3)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#77767b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#77767b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid rgba(199,198,202,0.3)", fontSize: 12 }} />
              <Bar dataKey="count" name="Serviços" fill="#030304" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Type and Status breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Serviços por tipo</h2>
            <span className="text-[12px] text-[#77767b]">{filtered.length} itens</span>
          </div>
          <div className="space-y-3">
            {Object.entries(totalByType).map(([label, count]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="text-[#1a1c1d] dark:text-white">{label}</span>
                  <span className="font-semibold text-[#1a1c1d] dark:text-white">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#f3f3f5] dark:bg-[#222426]">
                  <div className="h-1.5 rounded-full bg-[#030304] dark:bg-white transition-all" style={{ width: `${(count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Status dos serviços</h2>
            <span className="text-[12px] text-[#77767b]">{filtered.length} itens</span>
          </div>
          <div className="space-y-3">
            {Object.entries(totalByStatus).map(([label, count]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="text-[#1a1c1d] dark:text-white">{label}</span>
                  <span className="font-semibold text-[#1a1c1d] dark:text-white">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#f3f3f5] dark:bg-[#222426]">
                  <div className="h-1.5 rounded-full bg-[#030304] dark:bg-white transition-all" style={{ width: `${(count / maxStatus) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SERVICES TABLE SECTION ───────────────────────────────────────────────────
function buildCompletionWhatsappMessage(
  svc: ServiceOrder,
  completionMessage: string,
  itemCompletions: Array<{ id: string; completed: boolean; completionNote: string }>
): string {
  const num = String(svc.serviceNumber).padStart(4, "0");
  const lines: string[] = [
    `✅ *Serviço #${num} concluído!*`,
    `*Cliente:* ${svc.name}`,
  ];
  if (svc.seller) lines.push(`*Vendedor:* ${svc.seller}`);
  if (svc.requester) lines.push(`*Solicitante:* ${svc.requester}`);
  if (svc.developerUser?.name) lines.push(`*Desenvolvido por:* ${svc.developerUser.name}`);
  if (svc.type) lines.push(`*Tipo:* ${svc.type}`);
  if (svc.items.length > 0) {
    lines.push("", "*Itens:*");
    for (const item of svc.items) {
      const comp = itemCompletions.find((c) => c.id === item.id);
      const status = comp?.completed ? "✓" : "—";
      const sizes = item.rollSizes.length > 0 ? ` (${item.rollSizes.join(", ")})` : "";
      const note = comp?.completionNote ? ` — ${comp.completionNote}` : "";
      lines.push(`• ${item.name}${sizes} ${status}${note}`);
    }
  }
  if (completionMessage.trim()) lines.push("", `*Observações:* ${completionMessage.trim()}`);
  return lines.join("\n");
}

function ServicesSection({ services, logs, role, userId, users, onReload, autoOpenServiceId }: {
  services: ServiceOrder[]; logs: ServiceLog[]; role: string; userId: string;
  users: { id: string; name: string; role?: string }[]; onReload: () => void;
  autoOpenServiceId?: string;
}) {
  const [tab, setTab] = useState<StatusTab>("open");
  const [search, setSearch] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ waMsg: string; phone: string } | null>(null);
  const [modal, setModal] = useState<
    | { type: "detail"; svc: ServiceOrder }
    | { type: "edit"; svc: ServiceOrder }
    | { type: "duplicate"; svc: ServiceOrder }
    | { type: "startDev"; svc: ServiceOrder }
    | { type: "complete"; svc: ServiceOrder }
    | { type: "delete"; svc: ServiceOrder }
    | { type: "upload"; svc: ServiceOrder }
    | null>(null);

  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenServiceId || services.length === 0) return;
    if (autoOpenedRef.current === autoOpenServiceId) return;
    const svc = services.find((s) => s.id === autoOpenServiceId);
    if (svc) { setModal({ type: "detail", svc }); autoOpenedRef.current = autoOpenServiceId; }
  }, [autoOpenServiceId, services]);

  const tabs: { key: StatusTab; label: string; color: { border: string; text: string; activeBadge: string; inactiveBadge: string } }[] = [
    { key: "open",        label: "Abertos",        color: { border: "border-blue-500",    text: "text-blue-600 dark:text-blue-400",    activeBadge: "bg-blue-500 text-white",                                      inactiveBadge: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" } },
    { key: "development", label: "Desenvolvimento", color: { border: "border-amber-500",   text: "text-amber-600 dark:text-amber-400",  activeBadge: "bg-amber-500 text-white",                                     inactiveBadge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" } },
    { key: "done",        label: "Concluídos",      color: { border: "border-emerald-500", text: "text-emerald-600 dark:text-emerald-400", activeBadge: "bg-emerald-500 text-white",                                 inactiveBadge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" } },
    { key: "deleted",     label: "Deletados",       color: { border: "border-red-400",     text: "text-red-500 dark:text-red-400",      activeBadge: "bg-red-400 text-white",                                       inactiveBadge: "bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-300" } },
  ];

  const filtered = services
    .filter((s) => s.status === tab)
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || String(s.serviceNumber).includes(search));

  const sorted = [...filtered].sort((a, b) =>
    tab === "open" ? ((a.queuePosition ?? 999) - (b.queuePosition ?? 999)) : (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );

  const thCls = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#77767b]";
  const tdCls = "px-4 py-3 text-[13px] text-[#1a1c1d] dark:text-[#e0e0e0]";

  async function handleDuplicate(form: FormState) {
    await servicesApi.create({
      name: form.name, type: form.type, orderDate: form.orderDate,
      seller: form.seller, requester: form.requester, clientPhone: form.clientPhone,
      items: form.items.map(({ name, rollSizes, notes }) => ({ name, rollSizes, notes })),
    });
    setModal(null); onReload();
  }

  async function handleEdit(form: FormState) {
    if (modal?.type !== "edit") return;
    const svc = await servicesApi.update(modal.svc.id, {
      name: form.name, type: form.type, orderDate: form.orderDate,
      seller: form.seller, requester: form.requester, clientPhone: form.clientPhone,
      items: form.items.map(({ name, rollSizes, notes }) => ({ name, rollSizes, notes })),
    });
    // Delete attachments the user removed from the list
    for (let i = 0; i < form.items.length; i++) {
      const original = modal.svc.items[i]?.attachments ?? [];
      const kept = form.items[i].existingAttachments;
      const removed = original.filter((url) => !kept.includes(url));
      const svcItem = svc.items[i];
      if (svcItem) {
        for (const url of removed) {
          await servicesApi.deleteAttachment(svc.id, { itemId: svcItem.id, attachmentUrl: url, type: "service" });
        }
      }
    }
    // Upload any files added during edit
    for (let i = 0; i < form.items.length; i++) {
      const pending = form.items[i].pendingFiles;
      if (pending.length === 0) continue;
      const svcItem = svc.items[i];
      for (const f of pending) {
        await servicesApi.uploadAttachment(svc.id, {
          itemId: svcItem?.id, fileName: f.name, dataUrl: f.dataUrl, type: "service",
        });
      }
    }
    setModal(null); onReload();
  }

  async function handleStartDev(devUserId: string) {
    if (modal?.type !== "startDev") return;
    await servicesApi.changeStatus(modal.svc.id, { newStatus: "development", developerUserId: devUserId });
    setModal(null); onReload();
  }

  async function handleComplete(payload: { message: string; itemCompletions: Array<{ id: string; completed: boolean; completionNote: string }> }) {
    if (modal?.type !== "complete") return;
    const svc = modal.svc;
    await servicesApi.changeStatus(svc.id, { newStatus: "done", completionMessage: payload.message, itemCompletions: payload.itemCompletions });
    const waMsg = buildCompletionWhatsappMessage(svc, payload.message, payload.itemCompletions);
    const phone = (localStorage.getItem("orcamentista_whatsapp") ?? "554334207765").replace(/\D/g, "");
    setModal(null);
    onReload();
    setNotification({ waMsg, phone });
  }

  async function handleDelete(reason: string) {
    if (modal?.type !== "delete") return;
    await servicesApi.changeStatus(modal.svc.id, { newStatus: "deleted", deletedReason: reason });
    setModal(null); onReload();
  }

  async function handleReopen(svc: ServiceOrder) {
    await servicesApi.changeStatus(svc.id, { newStatus: "open" }); onReload();
  }

  async function handleQueueDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const ids = sorted.map((s) => s.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const newIds = [...ids];
    newIds.splice(from, 1);
    newIds.splice(to, 0, draggedId);
    setDraggedId(null); setDragOverId(null);
    await servicesApi.reorderQueue(newIds);
    onReload();
  }

  async function handleUpload(itemId: string | undefined, file: File, type: "service" | "completion") {
    if (modal?.type !== "upload") return;
    const dataUrl = await fileToDataUrl(file);
    await servicesApi.uploadAttachment(modal.svc.id, { itemId, fileName: file.name, dataUrl, type });
    onReload();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-[20px] font-bold text-[#1a1c1d] dark:text-white">Serviços</h1>
            <p className="text-[13px] text-[#77767b]">Gerencie a fila e acompanhe o andamento dos pedidos.</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[#77767b]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> No prazo</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> 24h</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> 48h</span>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-[rgba(199,198,202,0.3)] bg-white px-6 dark:bg-[#1c1e22] dark:border-white/8">
        {tabs.map(({ key, label, color }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-[13px] font-medium transition-colors ${
              tab === key
                ? `${color.border} ${color.text} font-semibold`
                : "border-transparent text-[#77767b] hover:text-[#1a1c1d] dark:hover:text-[#d0d0d0]"
            }`}>
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              tab === key ? color.activeBadge : color.inactiveBadge
            }`}>
              {services.filter((s) => s.status === key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex justify-end px-6 py-3 bg-[#f9f9fb] dark:bg-[#111214] border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
        <div className="relative w-72">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por ID ou nome"
            className="w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#005cba] dark:bg-[#1c1e22] dark:text-white dark:border-white/10" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-[#f9f9fb] dark:bg-[#111214]">
        <div className="min-w-[900px]">
          <table className="w-full border-collapse">
            <thead className="bg-white dark:bg-[#1c1e22] border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
              <tr>
                {tab === "open" && <th className={thCls + " w-16"}>Fila</th>}
                <th className={thCls + " w-20"}>ID</th>
                <th className={thCls}>Nome</th>
                <th className={thCls + " w-36"}>Serviço</th>
                <th className={thCls + " w-32"}>Data do pedido</th>
                <th className={thCls + " w-28"}>Cadastro</th>
                <th className={thCls + " w-32"}>Solicitante</th>
                <th className={thCls + " w-28"}>Vendedor</th>
                <th className={thCls + " w-32"}>Desenvolvedor</th>
                <th className={thCls + " w-28"}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={tab === "open" ? 10 : 9} className="py-16 text-center text-[14px] text-[#77767b]">
                    Nenhum serviço {tab === "open" ? "aberto" : tab === "development" ? "em desenvolvimento" : tab === "done" ? "concluído" : "excluído"}
                  </td>
                </tr>
              ) : sorted.map((svc, qIdx) => {
                const urg = urgencyOf(svc);
                const rowAccent = svc.status === "development"
                  ? "border-l-4 border-l-emerald-400"
                  : urg === "late"
                  ? "border-l-4 border-l-red-400"
                  : urg === "warn"
                  ? "border-l-4 border-l-amber-400"
                  : "border-l-4 border-l-transparent";
                const isDragging = draggedId === svc.id;
                const isDropTarget = dragOverId === svc.id && draggedId !== svc.id;
                const draggable = tab === "open" && canQueue(role);
                return (
                  <tr
                    key={svc.id}
                    draggable={draggable}
                    onDragStart={draggable ? () => setDraggedId(svc.id) : undefined}
                    onDragOver={draggable ? (e) => { e.preventDefault(); setDragOverId(svc.id); } : undefined}
                    onDrop={draggable ? () => handleQueueDrop(svc.id) : undefined}
                    onDragEnd={draggable ? () => { setDraggedId(null); setDragOverId(null); } : undefined}
                    className={`border-b border-[rgba(199,198,202,0.2)] bg-white hover:bg-[#f9f9fb] dark:bg-[#1c1e22] dark:border-white/5 dark:hover:bg-[#222426] transition-colors ${rowAccent} ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "border-t-2 border-t-[#005cba] dark:border-t-[#4d9fff]" : ""}`}
                  >
                    {tab === "open" && (
                      <td className={tdCls + " text-center"}>
                        <div className="flex flex-col items-center gap-0.5">
                          {canQueue(role) ? <DragHandleIcon /> : <LockIcon />}
                          <span className="text-[11px] font-mono text-[#77767b]">{qIdx + 1}</span>
                        </div>
                      </td>
                    )}
                    <td className={tdCls}>
                      <span className="rounded bg-[#f3f3f5] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]">
                        {String(svc.serviceNumber).padStart(4, "0")}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <button onClick={() => setModal({ type: "detail", svc })}
                        className="flex items-center gap-2 text-left hover:underline decoration-[#005cba] underline-offset-2">
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${DOT[urg]}`} />
                        <span className="font-semibold text-[#1a1c1d] hover:text-[#005cba] dark:text-white dark:hover:text-[#4d9fff]">{svc.name}</span>
                      </button>
                    </td>
                    <td className={tdCls}><TypeBadge type={svc.type} /></td>
                    <td className={tdCls}>{fmtDate(svc.orderDate)}</td>
                    <td className={tdCls}>{fmtDate(svc.createdAt)}</td>
                    <td className={tdCls + " truncate max-w-[120px]"}>{svc.requester || "—"}</td>
                    <td className={tdCls + " truncate max-w-[100px]"}>{svc.seller || "—"}</td>
                    <td className={tdCls + " truncate max-w-[120px]"}>{svc.developerUser?.name ?? "—"}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1">
                        {canEdit(role, userId, svc) && (
                          <IconBtn onClick={() => setModal({ type: "edit", svc })} title="Editar">
                            <PencilIcon />
                          </IconBtn>
                        )}
                        {canCreate(role) && (
                          <IconBtn onClick={() => setModal({ type: "duplicate", svc })} title="Duplicar serviço">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                            </svg>
                          </IconBtn>
                        )}
                        {svc.status === "open" && canWorkflow(role) && (
                          <button
                            onClick={() => setModal({ type: "startDev", svc })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40">
                            <PlayIcon />
                            Iniciar desenvolvimento
                          </button>
                        )}
                        {svc.status === "open" && role === "ADMIN" && (
                          <IconBtn onClick={() => setModal({ type: "complete", svc })} title="Concluir (Admin)" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/20">
                            <CheckIcon />
                          </IconBtn>
                        )}
                        {svc.status === "development" && canWorkflow(role) && (
                          <>
                            <IconBtn onClick={() => setModal({ type: "upload", svc })} title="Upload arquivo" className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                            </IconBtn>
                            <button
                              onClick={() => setModal({ type: "complete", svc })}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40">
                              <CheckIcon />
                              Concluir e avisar
                            </button>
                          </>
                        )}
                        {(svc.status === "done" || svc.status === "deleted") && (
                          <button onClick={() => handleReopen(svc)} title="Reabrir"
                            className="rounded-lg border border-[rgba(199,198,202,0.5)] px-2.5 py-1 text-[11px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                            Reabrir
                          </button>
                        )}
                        {svc.status !== "deleted" && canDelete(role, userId, svc) && (
                          <IconBtn onClick={() => setModal({ type: "delete", svc })} title="Excluir" className="text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20">
                            <TrashIcon />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal?.type === "detail" && <ServiceDetailModal svc={modal.svc} logs={logs} onClose={() => setModal(null)} />}
      {modal?.type === "edit" && <ServiceModal initial={modal.svc} onClose={() => setModal(null)} onSave={handleEdit} userName="" />}
      {modal?.type === "duplicate" && <ServiceModal initial={modal.svc} onClose={() => setModal(null)} onSave={handleDuplicate} userName="" isDuplicate />}
      {modal?.type === "startDev" && <StartDevModal svc={modal.svc} users={users.filter(u => ["ADMIN", "DESIGN", "ARTE", "ARTE_FINAL"].includes(u.role ?? ""))} defaultDevUserId={userId} onClose={() => setModal(null)} onConfirm={handleStartDev} />}
      {modal?.type === "complete" && (
        <CompleteModal svc={modal.svc} onClose={() => setModal(null)} onConfirm={handleComplete} />
      )}
      {modal?.type === "delete" && <DeleteModal svc={modal.svc} onClose={() => setModal(null)} onConfirm={handleDelete} />}
      {modal?.type === "upload" && <UploadModal svc={modal.svc} onClose={() => setModal(null)} onUpload={handleUpload} />}

      {/* Notificação pós-conclusão */}
      {notification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
              <h2 className="text-[16px] font-semibold text-[#1a1c1d] dark:text-white">Serviço concluído</h2>
              <button onClick={() => setNotification(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-[#77767b] hover:bg-[#f3f3f5] dark:hover:bg-[#222426]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-start gap-3 mb-5">
                <svg className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <p className="text-[13px] text-[#1a1c1d] dark:text-[#e0e0e0]">
                  Serviço marcado como concluído. Clique em "Abrir WhatsApp" para enviar a mensagem ao orçamentista.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { void navigator.clipboard.writeText(notification.waMsg); }}
                  className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.5)] px-4 py-2 text-[13px] text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                  Copiar mensagem
                </button>
                <a
                  href={`https://wa.me/${notification.phone}?text=${encodeURIComponent(notification.waMsg)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setNotification(null)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1ebe5d]">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  Abrir WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOGS SECTION ─────────────────────────────────────────────────────────────
function LogsSection({ logs, onReload }: { logs: ServiceLog[]; onReload: () => void }) {
  const thCls = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#77767b]";
  const tdCls = "px-4 py-3 text-[13px]";
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(199,198,202,0.3)] dark:border-white/8 bg-white dark:bg-[#1c1e22]">
        <div>
          <h1 className="text-[20px] font-bold text-[#1a1c1d] dark:text-white">Logs</h1>
          <p className="text-[13px] text-[#77767b]">Histórico das alterações realizadas no sistema.</p>
        </div>
        <button onClick={onReload}
          className="flex items-center gap-2 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-4 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:bg-[#1c1e22] dark:text-[#a0a0a4] dark:border-white/10 dark:hover:bg-[#222426]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          Atualizar
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-[#f9f9fb] dark:bg-[#111214] p-6">
        <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white overflow-hidden dark:bg-[#1c1e22] dark:border-white/8">
          <table className="w-full border-collapse min-w-[800px]">
            <thead className="border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
              <tr>
                <th className={thCls + " w-40"}>Data e hora</th>
                <th className={thCls + " w-36"}>Ação</th>
                <th className={thCls + " w-52"}>Serviço</th>
                <th className={thCls + " w-36"}>Usuário</th>
                <th className={thCls}>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-[14px] text-[#77767b]">Nenhum log registrado.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-[rgba(199,198,202,0.15)] dark:border-white/5 hover:bg-[#f9f9fb] dark:hover:bg-[#222426] transition-colors">
                  <td className={tdCls + " text-[#77767b] text-[12px]"}>{fmtDateTime(log.createdAt)}</td>
                  <td className={tdCls}><LogBadge action={log.action} /></td>
                  <td className={tdCls}>
                    {log.serviceOrderId ? (
                      <div className="text-[12px]">
                        {(() => {
                          const m = log.summary.match(/#(\d+)/);
                          return m ? (
                            <span className="font-mono font-bold text-[#1a1c1d] dark:text-white">
                              #{String(Number(m[1])).padStart(4, "0")}
                            </span>
                          ) : null;
                        })()}
                        <div className="text-[#77767b] truncate max-w-[180px]">
                          {log.summary.replace(/^Serviço #\d+\s*—?\s*/, "")}
                        </div>
                      </div>
                    ) : <span className="text-[#77767b]">—</span>}
                  </td>
                  <td className={tdCls}>
                    <div className="text-[12px]">
                      <div className="font-semibold text-[#1a1c1d] dark:text-white">{log.actor.name}</div>
                    </div>
                  </td>
                  <td className={tdCls + " text-[#46464a] dark:text-[#a0a0a4] text-[12px]"}>{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MOCKUP GENERATOR ─────────────────────────────────────────────────────────
function MockupSection() {
  return (
    <iframe
      src="/mockup/index.html"
      style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      title="Gerador de Aprovação de Layout"
    />
  );
}

// ─── ADMIN SECTION ────────────────────────────────────────────────────────────
function AdminSection(_props: { users: { id: string; name: string; role?: string }[] }) {
  const [networkPath, setNetworkPath] = useState(() => localStorage.getItem("services_network_path") ?? "");
  const [orcPhone, setOrcPhone] = useState(() => localStorage.getItem("orcamentista_whatsapp") ?? "554334207765");
  function saveNetworkPath() { localStorage.setItem("services_network_path", networkPath); }
  function saveOrcPhone() { localStorage.setItem("orcamentista_whatsapp", orcPhone.replace(/\D/g, "")); setOrcPhone(orcPhone.replace(/\D/g, "")); }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-[#1a1c1d] dark:text-white">Administração</h1>
        <p className="text-[13px] text-[#77767b]">Configurações do módulo de serviços.</p>
      </div>

      {/* WhatsApp do orçamentista */}
      <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
        <h2 className="mb-1 text-[14px] font-semibold text-[#1a1c1d] dark:text-white">WhatsApp do Orçamentista</h2>
        <p className="mb-3 text-[12px] text-[#77767b]">Número usado no botão "Avisar" ao concluir serviços. Apenas números com DDI (ex: 554334207765).</p>
        <div className="flex gap-2">
          <input value={orcPhone} onChange={(e) => setOrcPhone(e.target.value)}
            placeholder="554334207765"
            className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-[13px] font-mono outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10" />
          <button onClick={saveOrcPhone}
            className="rounded-xl bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0052a8]">
            Salvar
          </button>
        </div>
      </div>

      {/* Network path */}
      <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
        <h2 className="mb-1 text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Banco da Rede</h2>
        <p className="mb-3 text-[12px] text-[#77767b]">Caminho da pasta compartilhada na rede. Salvo localmente neste navegador.</p>
        <div className="flex gap-2">
          <input value={networkPath} onChange={(e) => setNetworkPath(e.target.value)}
            placeholder="\\servidor\compartilhado\servicos"
            className="flex-1 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-[13px] font-mono outline-none focus:border-[#005cba] dark:bg-[#23252a] dark:text-white dark:border-white/10" />
          <button onClick={saveNetworkPath}
            className="rounded-xl bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0052a8]">
            Salvar
          </button>
          {networkPath && (
            <a href={networkPath} className="rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2 text-[13px] text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
              Abrir
            </a>
          )}
        </div>
      </div>

      {/* Roles reference */}
      <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white p-5 dark:bg-[#1c1e22] dark:border-white/8">
        <h2 className="mb-3 text-[14px] font-semibold text-[#1a1c1d] dark:text-white">Permissões por papel</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[rgba(199,198,202,0.3)] dark:border-white/8">
                {["Papel", "Criar", "Editar", "Excluir", "Workflow (dev/concluir)", "Fila (PCP)"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { role: "ADMIN",        label: "Admin",         create: true,  edit: true,  del: true,  workflow: true,  queue: true },
                { role: "PCP",          label: "PCP",           create: false, edit: false, del: true,  workflow: false, queue: true },
                { role: "DESIGN",       label: "Desenvolvedor",         create: false, edit: false, del: false, workflow: true,  queue: false },
                { role: "ARTE",        label: "Desenv. de Arte",       create: false, edit: false, del: false, workflow: true,  queue: false },
                { role: "ARTE_FINAL",  label: "Arte Final",            create: false, edit: false, del: false, workflow: true,  queue: false },
                { role: "GERENTE",      label: "Gerente",       create: true,  edit: true,  del: true,  workflow: false, queue: false },
                { role: "SUPERVISOR",   label: "Supervisor",    create: true,  edit: true,  del: true,  workflow: false, queue: false },
                { role: "ORCAMENTISTA", label: "Orçamentista",  create: true,  edit: true,  del: false, workflow: false, queue: false },
                { role: "MEMBER",       label: "Membro",        create: true,  edit: true,  del: false, workflow: false, queue: false },
                { role: "CONSULTA",     label: "Consulta",      create: false, edit: false, del: false, workflow: false, queue: false },
              ].map(({ role, label, create, edit, del, workflow, queue }) => (
                <tr key={role} className="border-b border-[rgba(199,198,202,0.15)] dark:border-white/5">
                  <td className="px-3 py-2 dark:text-white">
                    <span className="font-semibold text-[#1a1c1d] dark:text-white">{label}</span>
                    <span className="ml-1 font-mono text-[10px] text-[#77767b]">({role})</span>
                  </td>
                  {[create, edit, del, workflow, queue].map((v, i) => (
                    <td key={i} className="px-3 py-2">
                      <span className={v ? "text-emerald-500" : "text-[#d1d5db] dark:text-[#374151]"}>{v ? "✓" : "—"}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
type Modal = { type: "create" };

export function ServicesPage() {
  const { user } = useAuth();
  const role = user?.role ?? "MEMBER";
  const userId = user?.id ?? "";
  const userName = user?.name ?? "";

  const [searchParams] = useSearchParams();
  const autoOpenId = searchParams.get("id") ?? undefined;

  const [section, setSection] = useState<Section>(() => autoOpenId ? "servicos" : "dashboard");
  const [services, setServices] = useState<ServiceOrder[]>([]);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [networkPath] = useState(() => localStorage.getItem("services_network_path") ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, logData] = await Promise.all([servicesApi.list(), servicesApi.logs()]);
      setServices(all); setLogs(logData);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 s without showing loading spinner
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [all, logData] = await Promise.all([servicesApi.list(), servicesApi.logs()]);
        setServices(all); setLogs(logData);
      } catch {}
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/users/directory", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const typed = data as { id: string; name: string; role?: string }[];
          setUsers(typed.map((u) => ({ id: u.id, name: u.name, role: u.role })));
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate(form: FormState) {
    const svc = await servicesApi.create({
      name: form.name, type: form.type, orderDate: form.orderDate,
      seller: form.seller, requester: form.requester, clientPhone: form.clientPhone,
      items: form.items.map(({ name, rollSizes, notes }) => ({ name, rollSizes, notes })),
    });
    // Upload pending files for each item
    for (let i = 0; i < form.items.length; i++) {
      const pending = form.items[i].pendingFiles;
      if (pending.length === 0) continue;
      const svcItem = svc.items[i];
      for (const f of pending) {
        await servicesApi.uploadAttachment(svc.id, {
          itemId: svcItem?.id, fileName: f.name, dataUrl: f.dataUrl, type: "service",
        });
      }
    }
    setModal(null); await load();
  }

  const isConsulta = role === "CONSULTA";
  // If current section is not accessible, fall back to dashboard
  useEffect(() => {
    if (isConsulta && (section === "mockup" || section === "admin")) setSection("dashboard");
  }, [isConsulta, section]);

  const allNavItems: { key: Section; label: string; roles?: string[]; icon: React.ReactNode }[] = [
    { key: "dashboard", label: "Dashboard", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg> },
    { key: "servicos", label: "Serviços", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c0 .621-.504 1.125-1.125 1.125H9.75m1.125-1.125c0 .621.504 1.125 1.125 1.125h1.5m1.125 0c0 .621.504 1.125 1.125 1.125H15m-3 0h1.5" /></svg> },
    { key: "logs", label: "Logs", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg> },
    { key: "mockup", label: "Gerador de mockup", roles: ["ADMIN", "DESIGN", "ARTE", "ARTE_FINAL", "GERENTE", "SUPERVISOR", "PCP", "MEMBER", "ORCAMENTISTA", "COMERCIAL"], icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg> },
    { key: "admin", label: "Administração", roles: ["ADMIN", "GERENTE", "SUPERVISOR", "PCP"], icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg> },
  ];
  const navItems = allNavItems.filter((n) => !n.roles || n.roles.includes(role));

  return (
    <div className="flex h-full flex-col">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between border-b border-[rgba(199,198,202,0.3)] bg-white px-6 dark:bg-[#1c1e22] dark:border-white/8">
        <nav className="flex gap-0">
          {navItems.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setSection(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-[13px] font-medium transition-colors ${
                section === key
                  ? "border-[#030304] text-[#030304] dark:border-white dark:text-white"
                  : "border-transparent text-[#77767b] hover:text-[#1a1c1d] dark:hover:text-white"
              }`}>
              {icon}
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {networkPath && (
            <a href={networkPath}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426]">
              Banco da rede
            </a>
          )}
          {canCreate(role) && (
            <button onClick={() => setModal({ type: "create" })}
              className="flex items-center gap-2 rounded-xl bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#004fa0]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Adicionar serviço
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#030304] border-t-transparent dark:border-white dark:border-t-transparent" />
          </div>
        ) : (
          <>
            {section === "dashboard" && <div className="h-full overflow-y-auto"><DashboardSection services={services} /></div>}
            {section === "servicos" && <ServicesSection services={services} logs={logs} role={role} userId={userId} users={users} onReload={load} autoOpenServiceId={autoOpenId} />}
            {section === "logs" && <LogsSection logs={logs} onReload={load} />}
            {section === "mockup" && <div className="h-full"><MockupSection /></div>}
            {section === "admin" && <div className="h-full overflow-y-auto"><AdminSection users={users} /></div>}
          </>
        )}
      </div>

      {/* Create modal */}
      {modal?.type === "create" && (
        <ServiceModal initial={null} onClose={() => setModal(null)} onSave={handleCreate} userName={userName} />
      )}
    </div>
  );
}
