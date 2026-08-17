import { useEffect, useRef, useState, type FormEvent } from "react";
import { crmApi, type ContactInput } from "../api/crm";
import { ApiError } from "../api/client";
import type { Contact } from "../types";
import { parseCsv, mapCsvRowToContact } from "../lib/csv";
import { Button } from "../components/common/Button";
import { CrmSubNav } from "../components/crm/CrmSubNav";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function exportContactsCsv(contacts: Contact[]) {
  const rows = [
    ["Nome", "Empresa", "Email", "Telefone", "Notas"],
    ...contacts.map((c) => [c.name, c.company ?? "", c.email ?? "", c.phone ?? "", c.notes ?? ""]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contatos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    crmApi.listContacts().then(setContacts);
  }

  useEffect(reload, []);

  function openNew() {
    setEditingId(null);
    setName(""); setCompany(""); setEmail(""); setPhone(""); setNotes("");
    setError(null);
    setShowForm(true);
  }

  function startEdit(c: Contact) {
    setEditingId(c.id);
    setName(c.name);
    setCompany(c.company ?? "");
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setNotes(c.notes ?? "");
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = {
        name,
        company: company || null,
        email: email || null,
        phone: phone || null,
        notes: notes || null,
      };
      if (editingId) {
        await crmApi.updateContact(editingId, data);
      } else {
        await crmApi.createContact(data);
      }
      closeForm();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o contato");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImportResult(null);
    setError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const mapped: ContactInput[] = rows
        .map(mapCsvRowToContact)
        .filter((c) => c.name.trim().length > 0);

      if (mapped.length === 0) {
        setError("Nenhum contato válido encontrado no arquivo.");
        return;
      }

      const result = await crmApi.importContacts(mapped);
      setImportResult(
        `${result.created} contato(s) importado(s)` +
          (result.skipped > 0 ? `, ${result.skipped} ignorado(s)` : "")
      );
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível importar o arquivo");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(`Excluir o contato "${c.name}"?`)) return;
    try {
      await crmApi.deleteContact(c.id);
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível excluir o contato");
    }
  }

  const filtered = search.trim()
    ? contacts.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q)
        );
      })
    : contacts;

  const inputCls =
    "mt-1 w-full rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-3 py-2 text-sm text-[#1a1c1d] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-[#77767b]";

  return (
    <div className="min-h-full overflow-y-auto p-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Comercial</h1>
          <p className="mt-1 text-[17px] text-[#46464a]">
            {contacts.length} contato{contacts.length !== 1 ? "s" : ""} cadastrado{contacts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {contacts.length > 0 && (
            <button
              onClick={() => exportContactsCsv(filtered.length > 0 ? filtered : contacts)}
              className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2.5 text-[13px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exportar CSV
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.3)] px-4 py-2.5 text-[13px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] disabled:opacity-50 dark:hover:bg-[#222426]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            {importing ? "Importando..." : "Importar CSV"}
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#030304] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/10 transition-all hover:bg-[#1d1d1f] active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo contato
          </button>
        </div>
      </div>

      <CrmSubNav />

      {importResult && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/25 dark:text-green-400">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          {importResult}
        </div>
      )}

      {/* Search */}
      <div className="mb-5 relative">
        <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          placeholder="Buscar por nome, empresa, email ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-[rgba(199,198,202,0.3)] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1a1c1d] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>

      {/* Contacts list */}
      <div className="space-y-2">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="glass-card smooth-shadow flex items-center gap-4 rounded-2xl px-5 py-4 transition-shadow hover:shadow-md"
          >
            {/* Avatar */}
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-[13px] font-bold text-brand">
              {initials(c.name)}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#030304]">
                {c.name}
                {c.company && (
                  <span className="ml-2 text-[13px] font-normal text-[#77767b]">{c.company}</span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-[#46464a]">
                {[c.email, c.phone].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
              </p>
              {c.notes && (
                <p className="mt-0.5 truncate text-[12px] text-[#77767b]">{c.notes}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => startEdit(c)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#46464a] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(c)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3f3f5] dark:bg-[#222426]">
              <svg className="h-7 w-7 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-[#1a1c1d]">
              {search.trim() ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
            </p>
            <p className="mt-1 text-[13px] text-[#77767b]">
              {search.trim() ? "Tente outro termo de busca." : "Clique em \"Novo contato\" para começar."}
            </p>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-[#1c1e22]">
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-6 py-4 dark:border-white/8">
              <h2 className="text-[17px] font-semibold text-[#030304]">
                {editingId ? "Editar contato" : "Novo contato"}
              </h2>
              <button
                onClick={closeForm}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#77767b] transition-colors hover:bg-[#f3f3f5] dark:hover:bg-[#222426]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nome *</label>
                  <input
                    required
                    autoFocus
                    placeholder="Nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Empresa</label>
                  <input
                    placeholder="Empresa (opcional)"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    placeholder="email@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input
                    placeholder="(44) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notas</label>
                <textarea
                  placeholder="Observações sobre o contato..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </div>
              {error && (
                <p className="text-[13px] text-red-600">{error}</p>
              )}
              <div className="flex items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4 dark:border-white/8">
                <Button type="button" variant="secondary" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar contato"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
