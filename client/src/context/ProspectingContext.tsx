import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { crmApi } from "../api/crm";
import type { ProspectCompany } from "../types";

interface ProspectingCtxValue {
  segmento: string;
  setSegmento: (v: string) => void;
  regiao: string;
  setRegiao: (v: string) => void;
  quantidade: number;
  setQuantidade: (v: number) => void;
  observacoes: string;
  setObservacoes: (v: string) => void;
  loading: boolean;
  error: string | null;
  companies: ProspectCompany[] | null;
  raw: string | null;
  addedNames: Set<string>;
  lastSearch: { segmento: string; regiao: string; quantidade: number } | null;
  runSearch: () => Promise<void>;
  addContact: (c: ProspectCompany) => Promise<void>;
  exportCsv: () => void;
  clearResults: () => void;
}

const ProspectingContext = createContext<ProspectingCtxValue | null>(null);

export function ProspectingProvider({ children }: { children: ReactNode }) {
  const [segmento, setSegmento] = useState("");
  const [regiao, setRegiao] = useState("");
  const [quantidade, setQuantidade] = useState(5);
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<ProspectCompany[] | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [lastSearch, setLastSearch] = useState<{ segmento: string; regiao: string; quantidade: number } | null>(null);

  const runSearch = useCallback(async () => {
    setError(null);
    setLoading(true);
    setCompanies([]);
    setRaw(null);
    setAddedNames(new Set());
    setLastSearch({ segmento, regiao, quantidade });

    try {
      const res = await fetch("/api/crm/prospecting/stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmento,
          regiao,
          quantidade,
          observacoes: observacoes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(body.error ?? "Erro desconhecido");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          let event: { type: string; company?: ProspectCompany; raw?: string; message?: string };
          try { event = JSON.parse(json); } catch { continue; }

          if (event.type === "company" && event.company) {
            setCompanies((prev) => [...(prev ?? []), event.company!]);
          } else if (event.type === "done") {
            setRaw(event.raw ?? null);
            setLoading(false);
          } else if (event.type === "error") {
            setError(event.message ?? "Erro na pesquisa");
            setLoading(false);
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a pesquisa");
    } finally {
      setLoading(false);
    }
  }, [segmento, regiao, quantidade, observacoes]);

  const addContact = useCallback(async (company: ProspectCompany) => {
    await crmApi.createContact({
      name: company.nome,
      company: company.nome,
      phone: company.telefone || null,
      notes: [
        company.cidade ? `Cidade: ${company.cidade}` : null,
        company.porte ? `Porte: ${company.porte}` : null,
        company.redeSocial ? `Rede social: ${company.redeSocial}` : null,
        company.fontes ? `Fontes: ${company.fontes}` : null,
        company.confiabilidade ? `Confiabilidade: ${company.confiabilidade}` : null,
        "Origem: Prospecção (IA)",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    setAddedNames((prev) => new Set(prev).add(company.nome));
  }, []);

  const exportCsv = useCallback(() => {
    if (!companies || companies.length === 0) return;
    const headers = ["Nome da empresa", "Cidade", "Telefone", "Porte", "Rede social", "Fontes", "Confiabilidade"];
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = companies.map((c) =>
      [c.nome, c.cidade, c.telefone, c.porte, c.redeSocial, c.fontes, c.confiabilidade].map(escape).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospeccao-${(segmento || "lista").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [companies, segmento]);

  const clearResults = useCallback(() => {
    setCompanies(null);
    setRaw(null);
    setError(null);
    setAddedNames(new Set());
    setLastSearch(null);
  }, []);

  return (
    <ProspectingContext.Provider
      value={{
        segmento, setSegmento,
        regiao, setRegiao,
        quantidade, setQuantidade,
        observacoes, setObservacoes,
        loading, error,
        companies, raw, addedNames, lastSearch,
        runSearch, addContact, exportCsv, clearResults,
      }}
    >
      {children}
    </ProspectingContext.Provider>
  );
}

export function useProspecting() {
  const ctx = useContext(ProspectingContext);
  if (!ctx) throw new Error("useProspecting must be inside ProspectingProvider");
  return ctx;
}
