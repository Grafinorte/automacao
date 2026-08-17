import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { quotesApi } from "../api/quotes";
import type { QuoteListItem } from "../types";
import { ISSUING_COMPANY_LABELS } from "../types";
import { useAuth } from "../context/AuthContext";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function QuotesListPage() {
  const { user } = useAuth();
  const canDelete = user?.role === "ADMIN" || user?.role === "ORCAMENTISTA";
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [emailModal, setEmailModal] = useState<{ id: number; quoteId: string } | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  function reload() {
    quotesApi.list().then(setQuotes);
  }
  useEffect(reload, []);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este orçamento?")) return;
    await quotesApi.remove(id);
    reload();
  }

  function openEmailModal(quoteId: string, quoteNumber: number) {
    setEmailModal({ id: quoteNumber, quoteId });
    setEmailTo(""); setEmailError(null); setEmailSuccess(false);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailModal) return;
    setEmailSending(true); setEmailError(null);
    try {
      await quotesApi.sendEmail(emailModal.quoteId, emailTo);
      setEmailSuccess(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Erro ao enviar e-mail");
    } finally { setEmailSending(false); }
  }

  return (
    <div className="min-h-full overflow-y-auto p-8">
      {/* Modal de envio de e-mail */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-[17px] font-semibold text-[#030304]">Enviar orçamento por e-mail</h3>
            <p className="mb-5 text-[13px] text-[#77767b]">Orçamento #{emailModal.id} · PDF anexado automaticamente</p>
            {emailSuccess ? (
              <div className="rounded-xl bg-green-50 p-4 text-center">
                <p className="text-[15px] font-semibold text-green-700">E-mail enviado com sucesso!</p>
                <p className="mt-1 text-[13px] text-green-600">A proposta foi enviada para {emailTo}</p>
                <button onClick={() => setEmailModal(null)}
                  className="mt-4 rounded-xl bg-green-600 px-5 py-2 text-[13px] font-semibold text-white">
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendEmail} className="space-y-3">
                <input type="email" placeholder="E-mail do cliente" value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)} required
                  className="w-full rounded-xl border border-[#e0e0e2] px-4 py-2.5 text-[14px] focus:border-[#2563eb] focus:outline-none" />
                {emailError && <p className="text-[13px] text-red-600">{emailError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEmailModal(null)}
                    className="flex-1 rounded-xl border border-[#e0e0e2] py-2.5 text-[13px] font-medium text-[#46464a]">
                    Cancelar
                  </button>
                  <button type="submit" disabled={emailSending}
                    className="flex-1 rounded-xl bg-[#030304] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
                    {emailSending ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Financeiro · Orçamentista</p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-[#030304]">Orçamentos</h1>
          <p className="mt-1 text-[17px] text-[#46464a]">Gerencie cotações e análise de custo gráfico.</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/orcamentos/novo"
            className="flex items-center gap-2 rounded-xl bg-[#030304] px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/10 transition-all hover:bg-[#1d1d1f] active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Novo Orçamento
          </Link>
        </div>
      </div>

      {/* Table Card */}
      <div className="glass-card smooth-shadow overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.05)] px-6 py-4">
          <h2 className="text-[15px] font-semibold text-[#030304]">Orçamentos Recentes</h2>
          <p className="text-[13px] text-[#77767b]">{quotes.length} orçamento(s)</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[rgba(0,0,0,0.04)] bg-[#f9f9fb]/60">
                <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Nº & Empresa</th>
                <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Cliente</th>
                <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Data</th>
                <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Valor Total</th>
                <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.04)]">
              {quotes.map((q) => (
                <tr key={q.id} className="group transition-colors hover:bg-[#f3f3f5]/50">
                  <td className="px-6 py-4">
                    <p className="text-[13px] font-semibold text-[#030304]">#{q.number}</p>
                    <p className="text-[11px] text-[#77767b]">{ISSUING_COMPANY_LABELS[q.issuingCompany]}</p>
                  </td>
                  <td className="px-4 py-4 text-[15px] text-[#1a1c1d]">{q.clientName}</td>
                  <td className="px-4 py-4 text-[15px] text-[#46464a]">{formatDate(q.createdAt)}</td>
                  <td className="px-4 py-4 text-[15px] font-semibold text-[#030304]">{formatCurrency(q.total)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <a
                        href={quotesApi.pdfUrl(q.id)}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-[#c7c6ca] px-3 py-1.5 text-[12px] font-medium text-[#1a1c1d] transition-colors hover:bg-[#f3f3f5]"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" /></svg>
                        Ver PDF
                      </a>
                      <button
                        onClick={() => openEmailModal(q.id, q.number)}
                        className="flex items-center gap-1.5 rounded-lg border border-[#c7c6ca] px-3 py-1.5 text-[12px] font-medium text-[#1a1c1d] transition-colors hover:bg-[#f3f3f5]"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                        Enviar
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <svg className="mx-auto mb-3 h-10 w-10 text-[#c7c6ca]" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" /></svg>
                    <p className="text-[15px] font-medium text-[#46464a]">Nenhum orçamento criado ainda</p>
                    <p className="mt-1 text-[13px] text-[#77767b]">Clique em "Novo Orçamento" para começar.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {quotes.length > 0 && (
          <div className="border-t border-[rgba(0,0,0,0.04)] px-6 py-3">
            <p className="text-[13px] text-[#77767b]">Mostrando {quotes.length} orçamento(s)</p>
          </div>
        )}
      </div>
    </div>
  );
}
