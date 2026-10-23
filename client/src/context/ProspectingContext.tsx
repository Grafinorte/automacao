import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { crmApi } from "../api/crm";
import { ApiError } from "../api/client";
import type { ProspectLead, ProspectSearch } from "../types";

type Company = "GRAFINORTE" | "PLUSPACK";

interface ProspectingCtxValue {
  segmento: string;
  setSegmento: (v: string) => void;
  regiao: string;
  setRegiao: (v: string) => void;
  company: Company;
  setCompany: (v: Company) => void;
  loading: boolean;
  error: string | null;
  /** Busca aberta na tela (nova ou aberta do histórico) */
  search: ProspectSearch | null;
  runSearch: () => Promise<void>;
  openSearch: (id: string) => Promise<void>;
  addToCrm: (lead: ProspectLead) => Promise<void>;
  setStatus: (lead: ProspectLead, status: "NOVO" | "DESCARTADO") => Promise<void>;
  exportCsv: () => void;
  clearSearch: () => void;
}

const ProspectingContext = createContext<ProspectingCtxValue | null>(null);

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

export function ProspectingProvider({ children }: { children: ReactNode }) {
  const [segmento, setSegmento] = useState("");
  const [regiao, setRegiao] = useState("");
  const [company, setCompany] = useState<Company>("GRAFINORTE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<ProspectSearch | null>(null);

  const runSearch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSearch(await crmApi.searchProspects({ segmento: segmento.trim(), regiao: regiao.trim(), company }));
    } catch (err) {
      setError(errMsg(err, "Não foi possível concluir a busca"));
    } finally {
      setLoading(false);
    }
  }, [segmento, regiao, company]);

  const openSearch = useCallback(async (id: string) => {
    setError(null);
    setLoading(true);
    try {
      setSearch(await crmApi.getProspectSearch(id));
    } catch (err) {
      setError(errMsg(err, "Não foi possível abrir a busca"));
    } finally {
      setLoading(false);
    }
  }, []);

  const patchLead = (id: string, patch: Partial<ProspectLead>) =>
    setSearch((s) => (s ? { ...s, leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : s));

  const addToCrm = useCallback(async (lead: ProspectLead) => {
    const r = await crmApi.addProspectToCrm(lead.id);
    patchLead(lead.id, { status: "ADICIONADO", contactId: r.contactId, dealId: r.dealId, inCrm: true, addedByName: "você", addedAt: new Date().toISOString() });
  }, []);

  const setStatus = useCallback(async (lead: ProspectLead, status: "NOVO" | "DESCARTADO") => {
    await crmApi.setProspectStatus(lead.id, status);
    patchLead(lead.id, { status });
  }, []);

  const exportCsv = useCallback(() => {
    if (!search || search.leads.length === 0) return;
    const headers = ["Empresa", "Telefone", "Site", "Endereço", "Ramo", "Nota Google", "Avaliações", "Situação", "Google Maps"];
    const situacao = (l: ProspectLead) =>
      l.status === "ADICIONADO" ? "No CRM" : l.status === "DESCARTADO" ? "Descartado" : l.inCrm ? "Já era contato" : "Novo";
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = search.leads.map((l) =>
      [l.name, l.phone, l.website, l.address, l.category, l.rating, l.reviewCount, situacao(l), l.mapsUrl].map(escape).join(";")
    );
    const blob = new Blob(["﻿" + [headers.join(";"), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospeccao-${search.segmento}-${search.regiao}.csv`.replace(/[\s/]+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  }, [search]);

  const clearSearch = useCallback(() => {
    setSearch(null);
    setError(null);
  }, []);

  return (
    <ProspectingContext.Provider
      value={{
        segmento, setSegmento,
        regiao, setRegiao,
        company, setCompany,
        loading, error, search,
        runSearch, openSearch, addToCrm, setStatus, exportCsv, clearSearch,
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
