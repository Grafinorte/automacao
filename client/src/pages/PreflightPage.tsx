import { useState, useRef, useEffect, useCallback } from "react";
import {
  analyzePdf,
  fetchHistory,
  deleteHistoryEntry as apiDeleteHistory,
  clearHistory as apiClearHistory,
  PreflightApiError,
} from "../api/preflight";
import type {
  PreflightResult,
  PageResult,
  AlertSeverity,
  ColorInfo,
  HistoryRow,
} from "../api/preflight";

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtMm(mm: number): string {
  const r = parseFloat(mm.toFixed(2));
  return Number.isInteger(r) ? `${r} mm` : `${r} mm`;
}

function fmtDimMm(w: number, h: number): string {
  return `${fmtMm(w)} × ${fmtMm(h)}`;
}

function fmtDim(dim: { widthMm: number; heightMm: number }): string {
  return fmtDimMm(dim.widthMm, dim.heightMm);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// ─── Status helpers ────────────────────────────────────────────────────────────
function statusColor(s: "pass" | "warning" | "error"): string {
  if (s === "pass")    return "text-emerald-600 dark:text-emerald-400";
  if (s === "warning") return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function statusBg(s: "pass" | "warning" | "error"): string {
  if (s === "pass")    return "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/40";
  if (s === "warning") return "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/40";
  return "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/40";
}

const STATUS_LABEL: Record<"pass" | "warning" | "error", string> = {
  pass: "Aprovado",
  warning: "Verificar",
  error: "Reprovado",
};

function StatusPill({ status }: { status: "pass" | "warning" | "error" }) {
  const styles = {
    pass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles}`}>
      {status === "pass" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
      {status === "warning" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      )}
      {status === "error" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

function alertSeverityBg(s: AlertSeverity): string {
  if (s === "error")   return "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300";
  if (s === "warning") return "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-300";
  return "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/40 dark:text-blue-300";
}

function alertIcon(s: AlertSeverity): React.ReactNode {
  if (s === "error") return (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
  if (s === "warning") return (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  );
  return (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
  );
}

// ─── CMYK Channel Helpers ─────────────────────────────────────────────────────
function getPageChannels(color: ColorInfo): { c: boolean; m: boolean; y: boolean; k: boolean } {
  if (color.cmykChannels) return color.cmykChannels;
  if (color.hasCmyk) return { c: true, m: true, y: true, k: true };
  if (color.hasGray) return { c: false, m: false, y: false, k: true };
  return { c: false, m: false, y: false, k: false };
}

function channelKey(ch: { c: boolean; m: boolean; y: boolean; k: boolean }, hasRgb: boolean): string {
  return `${ch.c ? "C" : "-"}${ch.m ? "M" : "-"}${ch.y ? "Y" : "-"}${ch.k ? "K" : "-"}${hasRgb ? "R" : ""}`;
}

function isColorPage(color: ColorInfo): boolean {
  const ch = getPageChannels(color);
  return ch.c || ch.m || ch.y || color.hasRgb;
}

interface PageGroup {
  startPage: number;
  endPage: number;
  channels: { c: boolean; m: boolean; y: boolean; k: boolean };
  hasRgb: boolean;
}

function groupPagesByChannels(pages: PageResult[]): PageGroup[] {
  if (!pages.length) return [];
  const groups: PageGroup[] = [];
  let cur: PageGroup = {
    startPage: pages[0].pageNumber,
    endPage: pages[0].pageNumber,
    channels: getPageChannels(pages[0].color),
    hasRgb: pages[0].color.hasRgb,
  };
  for (let i = 1; i < pages.length; i++) {
    const pg = pages[i];
    const ch = getPageChannels(pg.color);
    if (channelKey(ch, pg.color.hasRgb) === channelKey(cur.channels, cur.hasRgb)) {
      cur.endPage = pg.pageNumber;
    } else {
      groups.push(cur);
      cur = { startPage: pg.pageNumber, endPage: pg.pageNumber, channels: ch, hasRgb: pg.color.hasRgb };
    }
  }
  groups.push(cur);
  return groups;
}

// ─── InkSquare ────────────────────────────────────────────────────────────────
function InkSquare({ ch, active, size = 18 }: { ch: "C" | "M" | "Y" | "K"; active: boolean; size?: number }) {
  type ChKey = "C" | "M" | "Y" | "K";
  const activeStyles: Record<ChKey, string> = {
    C: "bg-cyan-400 border-cyan-500 text-white",
    M: "bg-pink-500 border-pink-600 text-white",
    Y: "bg-yellow-400 border-yellow-500 text-[#6b4f00]",
    K: "bg-[#1a1c1d] border-black text-white dark:bg-[#e0e0e4] dark:border-[#c0c0c4] dark:text-[#1a1c1d]",
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm border font-bold leading-none ${
        active
          ? activeStyles[ch]
          : "bg-transparent border-[rgba(0,0,0,0.12)] text-[#b0b0b4] dark:border-white/15 dark:text-[#505054]"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {ch}
    </span>
  );
}

// ─── Color Visualization ──────────────────────────────────────────────────────
function ColorVisualization({ pages }: { pages: PageResult[] }) {
  if (!pages.length) return null;

  const groups = groupPagesByChannels(pages);

  // Document-wide channel usage
  let hasC = false, hasM = false, hasY = false, hasK = false;
  for (const pg of pages) {
    const ch = getPageChannels(pg.color);
    if (ch.c) hasC = true;
    if (ch.m) hasM = true;
    if (ch.y) hasY = true;
    if (ch.k) hasK = true;
  }
  const sepCount = [hasC, hasM, hasY, hasK].filter(Boolean).length;

  const colorCount = pages.filter((pg) => isColorPage(pg.color)).length;
  const bwCount = pages.length - colorCount;

  const rgbPages = pages.filter((pg) => pg.color.hasRgb).map((pg) => pg.pageNumber);

  return (
    <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white shadow-sm dark:bg-[#1c1e22] dark:border-white/8 overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[rgba(0,0,0,0.06)] px-5 py-3.5 dark:border-white/8">
        <svg className="flex-shrink-0 text-[#005cba]" style={{ width: "1.125rem", height: "1.125rem" }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
        </svg>
        <h3 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">
          Separações de cor
        </h3>
        <span className="ml-auto rounded-full bg-[#f3f3f5] px-2.5 py-0.5 text-[11px] font-semibold text-[#46464a] dark:bg-[#2a2c30] dark:text-[#c0c0c4]">
          {sepCount} {sepCount === 1 ? "separação" : "separações"}
        </span>
      </div>

      <div className="p-5">
        {/* Channel legend */}
        <div className="mb-4 flex items-center gap-4">
          {(["C", "M", "Y", "K"] as const).map((ch) => {
            const active = ch === "C" ? hasC : ch === "M" ? hasM : ch === "Y" ? hasY : hasK;
            const labels: Record<string, string> = { C: "Ciano", M: "Magenta", Y: "Amarelo", K: "Preto" };
            return (
              <div key={ch} className="flex items-center gap-1.5">
                <InkSquare ch={ch} active={active} size={20} />
                <span className={`text-[11px] font-medium ${active ? "text-[#1a1c1d] dark:text-white" : "text-[#b0b0b4] dark:text-[#505054]"}`}>
                  {labels[ch]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Page groups list */}
        <div className="space-y-1.5" style={{ maxHeight: "16rem", overflowY: "auto" }}>
          {groups.map((grp, i) => {
            const label =
              grp.startPage === grp.endPage
                ? `Página ${grp.startPage}`
                : `Páginas ${grp.startPage}–${grp.endPage}`;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 text-[12px] text-[#77767b]">{label}</span>
                <div className="flex items-center gap-0.5">
                  <InkSquare ch="C" active={grp.channels.c} />
                  <InkSquare ch="M" active={grp.channels.m} />
                  <InkSquare ch="Y" active={grp.channels.y} />
                  <InkSquare ch="K" active={grp.channels.k} />
                </div>
                {grp.hasRgb && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                    RGB
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer summary */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[rgba(199,198,202,0.3)] pt-3 dark:border-white/8">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#005cba]" />
            <span className="text-[12px] text-[#46464a] dark:text-[#c0c0c4]">
              Colorido: <strong className="text-[#1a1c1d] dark:text-white">{colorCount}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#a0a0a4]" />
            <span className="text-[12px] text-[#46464a] dark:text-[#c0c0c4]">
              Preto-e-branco: <strong className="text-[#1a1c1d] dark:text-white">{bwCount}</strong>
            </span>
          </div>
          {rgbPages.length > 0 && (
            <div className="ml-auto">
              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                ⚠ RGB em: {rgbPages.length <= 6
                  ? rgbPages.map((n) => `p.${n}`).join(", ")
                  : `${rgbPages.length} páginas`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Upload Area ──────────────────────────────────────────────────────────────
function UploadArea({
  onFile,
  loading,
}: {
  onFile: (file: File) => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-20 text-center transition-all cursor-pointer ${
        dragging
          ? "border-[#005cba] bg-blue-50 dark:bg-blue-950/20 scale-[1.01]"
          : "border-[rgba(199,198,202,0.5)] bg-[#f9f9fb] dark:bg-[#1c1e22] dark:border-white/10 hover:border-[#005cba]/60 hover:bg-blue-50/30 dark:hover:bg-blue-950/10"
      }`}
      onClick={() => !loading && inputRef.current?.click()}
    >
      {loading ? (
        <div className="flex flex-col items-center gap-5">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#005cba] border-t-transparent" />
          <div>
            <p className="text-[16px] font-semibold text-[#1a1c1d] dark:text-white">
              Analisando PDF...
            </p>
            <p className="mt-0.5 text-[13px] text-[#77767b]">
              Verificando dimensões, cores, fontes e sangria
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className={`mb-5 flex h-20 w-20 items-center justify-center rounded-2xl transition-colors ${
            dragging ? "bg-[#005cba]" : "bg-white shadow-sm dark:bg-[#222426]"
          }`}>
            <svg
              className={`h-10 w-10 transition-colors ${dragging ? "text-white" : "text-[#005cba]"}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="text-[18px] font-bold text-[#1a1c1d] dark:text-white">
            {dragging ? "Solte o PDF aqui" : "Arraste o PDF aqui"}
          </p>
          <p className="mt-1.5 text-[13px] text-[#77767b]">
            ou clique para selecionar o arquivo
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { onFile(file); e.target.value = ""; }
            }}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="mt-6 flex items-center gap-2 rounded-xl bg-[#005cba] px-6 py-3 text-[14px] font-semibold text-white hover:bg-[#004fa0] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
            </svg>
            Selecionar PDF
          </button>
          <p className="mt-4 text-[11px] text-[#a0a0a4]">
            Máximo 200 MB · Apenas arquivos .pdf
          </p>
        </>
      )}
    </div>
  );
}

// ─── Summary Cards ─────────────────────────────────────────────────────────────
function SummaryCards({ result }: { result: PreflightResult }) {
  const { summary } = result;
  const statusTextCls = statusColor(summary.overallStatus);

  const cards: { label: string; value: React.ReactNode; icon: React.ReactNode; accent: string }[] = [
    {
      label: "Status geral",
      value: <StatusPill status={summary.overallStatus} />,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
      accent: statusTextCls,
    },
    {
      label: "Erros",
      value: <span className="text-[24px] font-bold text-red-600 dark:text-red-400">{summary.errorCount}</span>,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      ),
      accent: summary.errorCount > 0 ? "text-red-500" : "text-[#a0a0a4]",
    },
    {
      label: "Avisos",
      value: <span className="text-[24px] font-bold text-amber-600 dark:text-amber-400">{summary.warningCount}</span>,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      ),
      accent: summary.warningCount > 0 ? "text-amber-500" : "text-[#a0a0a4]",
    },
    {
      label: "Informações",
      value: <span className="text-[24px] font-bold text-blue-600 dark:text-blue-400">{summary.infoCount}</span>,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
      ),
      accent: "text-blue-500",
    },
    {
      label: "Páginas",
      value: <span className="text-[24px] font-bold text-[#1a1c1d] dark:text-white">{summary.pageCount}</span>,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
      accent: "text-[#005cba]",
    },
    {
      label: "Peso do arquivo",
      value: <span className="text-[16px] font-bold text-[#1a1c1d] dark:text-white">{fmtFileSize(summary.fileSize)}</span>,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      ),
      accent: "text-[#77767b]",
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {cards.map((c) => (
        <div
          key={c.label}
          className="flex-none min-w-[140px] rounded-xl border border-[rgba(199,198,202,0.3)] bg-white p-4 dark:bg-[#1c1e22] dark:border-white/8"
        >
          <div className={`mb-2 ${c.accent}`}>{c.icon}</div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b] mb-1.5">{c.label}</p>
          {c.value}
        </div>
      ))}
    </div>
  );
}

// ─── Physical Size Card ────────────────────────────────────────────────────────
function PhysicalSizeCard({ result }: { result: PreflightResult }) {
  const firstPage = result.pages[0];
  if (!firstPage) return null;

  const { boxes } = firstPage;

  const allSameSize = result.pages.every(
    (p) =>
      Math.abs(p.boxes.finalSize.widthMm - boxes.finalSize.widthMm) < 0.5 &&
      Math.abs(p.boxes.finalSize.heightMm - boxes.finalSize.heightMm) < 0.5
  );

  const hasTrimBox = !!boxes.trimBox;
  const hasBleedBox = !!boxes.bleedBox; // real BleedBox in PDF
  const { bleedPerSide } = boxes;

  // Only show diagram when there is a confirmed BleedBox
  const showDiagram = hasBleedBox && !!bleedPerSide;

  const allSidesEqual = showDiagram && bleedPerSide &&
    Math.abs(bleedPerSide.top - bleedPerSide.bottom) < 0.05 &&
    Math.abs(bleedPerSide.top - bleedPerSide.left) < 0.05 &&
    Math.abs(bleedPerSide.top - bleedPerSide.right) < 0.05;

  return (
    <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white shadow-sm dark:bg-[#1c1e22] dark:border-white/8 overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[rgba(0,0,0,0.06)] px-5 py-3.5 dark:border-white/8">
        <svg className="flex-shrink-0 text-[#005cba]" style={{ height: "1.125rem", width: "1.125rem" }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
        <h3 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">
          Tamanho físico
          {!allSameSize && result.pages.length > 1 && (
            <span className="ml-2 text-[12px] font-normal text-[#77767b]">(mostrando página 1)</span>
          )}
        </h3>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Left: size info */}
        <div className="space-y-3">
          {/* MediaBox */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b] mb-0.5">
              Arquivo (MediaBox)
            </p>
            <p className="text-[17px] font-bold text-[#1a1c1d] dark:text-white leading-tight">
              {fmtDim(boxes.mediaBox)}
            </p>
          </div>

          {/* Final size */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b] mb-0.5">
              Tamanho final
            </p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-[20px] font-bold text-[#1a1c1d] dark:text-white leading-tight">
                {fmtDim(boxes.finalSize)}
              </p>
              {boxes.detectedSize && (
                <span className="rounded-lg bg-[#f3f3f5] px-2 py-0.5 text-[12px] font-semibold text-[#46464a] dark:bg-[#2a2c30] dark:text-[#c0c0c4]">
                  {boxes.detectedSize}
                </span>
              )}
            </div>
            {hasTrimBox ? (
              <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                TrimBox definida
              </p>
            ) : boxes.finalSizeSource === "CropBox" ? (
              <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                ⚠ TrimBox ausente — usando CropBox
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                ⚠ TrimBox ausente — usando MediaBox
              </p>
            )}
          </div>

          {/* Bleed size — only shown when BleedBox is defined */}
          {hasBleedBox && boxes.bleedBox ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b] mb-0.5">
                Tamanho com sangria (BleedBox)
              </p>
              <p className="text-[15px] font-bold text-[#1a1c1d] dark:text-white leading-tight">
                {fmtDim(boxes.bleedBox)}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              ⚠ BleedBox não definida
            </p>
          )}
        </div>

        {/* Right: bleed diagram (only when BleedBox confirmed) */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b] mb-2">
            Sangria por lado
          </p>

          {showDiagram && bleedPerSide ? (
            <div className="space-y-2">
              {allSidesEqual ? (
                // All sides equal — single value
                <div className="flex flex-col items-center gap-2">
                  <div className="relative" style={{ width: 100, height: 120 }}>
                    {/* Bleed outer border (dashed) */}
                    <div className="absolute inset-0 rounded border-2 border-dashed border-[#005cba]/40 dark:border-[#3b82f6]/40" />
                    {/* Page rectangle */}
                    <div className="absolute inset-[18px] rounded border-2 border-[#005cba] bg-[#f0f5ff] dark:bg-[#1a2030] dark:border-[#3b82f6]" />
                    {/* Single value center */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded bg-[#005cba] px-2 py-0.5 text-[11px] font-bold text-white">
                        {fmtMm(bleedPerSide.top)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium text-center">
                    Sangria uniforme em todos os lados
                  </p>
                </div>
              ) : (
                // Asymmetric — show all sides
                <div>
                  <div className="relative mx-auto" style={{ width: 110, height: 130 }}>
                    {/* Outer bleed area (dashed) */}
                    <div className="absolute inset-0 rounded border-2 border-dashed border-[#005cba]/40 dark:border-[#3b82f6]/40" />
                    {/* Page rectangle */}
                    <div className="absolute rounded border-2 border-[#005cba] bg-[#f0f5ff] dark:bg-[#1a2030] dark:border-[#3b82f6]"
                      style={{ top: 20, left: 22, right: 22, bottom: 20 }} />
                    {/* Top label */}
                    <div className="absolute left-0 right-0 top-0 flex h-[20px] items-center justify-center">
                      <span className="text-[9px] font-bold text-[#46464a] dark:text-[#a0a0a4]">
                        {fmtMm(bleedPerSide.top)}
                      </span>
                    </div>
                    {/* Bottom label */}
                    <div className="absolute left-0 right-0 bottom-0 flex h-[20px] items-center justify-center">
                      <span className="text-[9px] font-bold text-[#46464a] dark:text-[#a0a0a4]">
                        {fmtMm(bleedPerSide.bottom)}
                      </span>
                    </div>
                    {/* Left label */}
                    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center" style={{ width: 22 }}>
                      <span className="text-[9px] font-bold text-[#46464a] dark:text-[#a0a0a4]"
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                        {fmtMm(bleedPerSide.left)}
                      </span>
                    </div>
                    {/* Right label */}
                    <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center" style={{ width: 22 }}>
                      <span className="text-[9px] font-bold text-[#46464a] dark:text-[#a0a0a4]"
                        style={{ writingMode: "vertical-rl" }}>
                        {fmtMm(bleedPerSide.right)}
                      </span>
                    </div>
                  </div>

                  {/* Bleed status table */}
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    {[
                      { label: "Superior", val: bleedPerSide.top },
                      { label: "Inferior", val: bleedPerSide.bottom },
                      { label: "Esquerda", val: bleedPerSide.left },
                      { label: "Direita",  val: bleedPerSide.right },
                    ].map(({ label, val }) => {
                      const ok = val >= 2.8;
                      return (
                        <div key={label} className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${ok ? "bg-emerald-500" : val > 0 ? "bg-amber-500" : "bg-red-500"}`} />
                          <span className="text-[11px] text-[#77767b]">{label}:</span>
                          <span className={`text-[12px] font-semibold ${ok ? "text-emerald-600 dark:text-emerald-400" : val > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {fmtMm(val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : hasBleedBox ? (
            <p className="text-[12px] text-[#77767b]">
              BleedBox definida mas sangria por lado não calculada.
            </p>
          ) : (
            <p className="text-[12px] text-[#77767b]">
              {hasTrimBox
                ? "Defina uma BleedBox para visualizar a sangria por lado."
                : "Defina TrimBox e BleedBox para calcular a sangria por lado."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Flag Badge ────────────────────────────────────────────────────────────────
function FlagBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${
      ok
        ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/40 dark:text-emerald-300"
        : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300"
    }`}>
      {ok ? (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      )}
      {label}
    </span>
  );
}

// ─── Page Detail Panel ────────────────────────────────────────────────────────
function pageRowStatus(page: PageResult): "pass" | "warning" | "error" {
  if (page.alerts.some((a) => a.severity === "error")) return "error";
  if (page.alerts.some((a) => a.severity === "warning")) return "warning";
  return "pass";
}

function PageDetailPanel({ page }: { page: PageResult }) {
  const { boxes } = page;
  const { bleedPerSide } = boxes;

  const sections = [
    {
      title: "Tamanho físico",
      content: (
        <div className="space-y-2 text-[12px]">
          <div>
            <span className="text-[#77767b]">Arquivo (MediaBox):</span>{" "}
            <span className="font-semibold">{fmtDim(boxes.mediaBox)}</span>
          </div>
          <div>
            <span className="text-[#77767b]">Tamanho final:</span>{" "}
            <span className="font-semibold">{fmtDim(boxes.finalSize)}</span>
            {boxes.detectedSize && (
              <span className="ml-1.5 rounded bg-[#f3f3f5] px-1.5 py-0.5 text-[10px] font-medium dark:bg-[#2a2c30]">
                {boxes.detectedSize}
              </span>
            )}
            {boxes.trimBox ? (
              <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]">TrimBox</span>
            ) : boxes.finalSizeSource === "CropBox" ? (
              <span className="ml-1.5 text-amber-600 dark:text-amber-400 text-[10px]">⚠ CropBox (sem TrimBox)</span>
            ) : (
              <span className="ml-1.5 text-amber-600 dark:text-amber-400 text-[10px]">⚠ MediaBox (sem TrimBox)</span>
            )}
          </div>
          {boxes.bleedBox ? (
            <div>
              <span className="text-[#77767b]">Com sangria (BleedBox):</span>{" "}
              <span className="font-semibold">{fmtDim(boxes.bleedBox)}</span>
            </div>
          ) : (
            <div className="text-amber-600 dark:text-amber-400">⚠ BleedBox não definida</div>
          )}
          {boxes.cropBox && (
            <div>
              <span className="text-[#77767b]">CropBox:</span>{" "}
              {fmtDim(boxes.cropBox)}
            </div>
          )}
          <div>
            <span className="text-[#77767b]">Orientação:</span>{" "}
            {boxes.orientation === "portrait" ? "Retrato" :
             boxes.orientation === "landscape" ? "Paisagem" : "Quadrado"}
          </div>
          {bleedPerSide && boxes.bleedConfirmed ? (
            <div>
              <p className="text-[#77767b] mb-0.5">Sangria por lado:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                <span>Superior: <strong>{fmtMm(bleedPerSide.top)}</strong></span>
                <span>Inferior: <strong>{fmtMm(bleedPerSide.bottom)}</strong></span>
                <span>Esquerda: <strong>{fmtMm(bleedPerSide.left)}</strong></span>
                <span>Direita: <strong>{fmtMm(bleedPerSide.right)}</strong></span>
              </div>
            </div>
          ) : bleedPerSide && !boxes.bleedConfirmed ? (
            <div>
              <p className="text-[#77767b] mb-0.5">Sangria estimada (sem BleedBox):</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                <span>Superior: <strong>{fmtMm(bleedPerSide.top)}</strong></span>
                <span>Inferior: <strong>{fmtMm(bleedPerSide.bottom)}</strong></span>
                <span>Esquerda: <strong>{fmtMm(bleedPerSide.left)}</strong></span>
                <span>Direita: <strong>{fmtMm(bleedPerSide.right)}</strong></span>
              </div>
              <p className="text-[10px] text-[#a0a0a4] italic mt-0.5">Via MediaBox (estimado)</p>
            </div>
          ) : boxes.trimBox ? (
            <div className="text-[#77767b]">Sangria: não detectada</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Cores",
      content: (
        <div className="space-y-1.5 text-[12px]">
          {/* CMYK channel squares */}
          <div className="flex items-center gap-0.5">
            <InkSquare ch="C" active={getPageChannels(page.color).c} />
            <InkSquare ch="M" active={getPageChannels(page.color).m} />
            <InkSquare ch="Y" active={getPageChannels(page.color).y} />
            <InkSquare ch="K" active={getPageChannels(page.color).k} />
            {page.color.hasRgb && (
              <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">RGB</span>
            )}
            {page.color.hasSpot && (
              <span className="ml-1 rounded bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Spot</span>
            )}
          </div>
          {page.color.spotColorNames.length > 0 && (
            <div><span className="text-[#77767b]">Cores spot:</span> {page.color.spotColorNames.join(", ")}</div>
          )}
          <div className="text-[#77767b]">
            Confiança: <span className="text-[#1a1c1d] dark:text-white">{page.color.confidence}</span>
          </div>
        </div>
      ),
    },
    {
      title: `Fontes (${page.fonts.length})`,
      content: page.fonts.length === 0
        ? <p className="text-[12px] text-[#77767b]">Nenhuma fonte encontrada.</p>
        : (
          <div className="space-y-0.5">
            {page.fonts.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${f.embedded ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-[#77767b]">{f.type}</span>
                {f.subset && <span className="text-[10px] text-[#77767b]">subset</span>}
                {!f.embedded && (
                  <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                    não incorporada
                  </span>
                )}
              </div>
            ))}
          </div>
        ),
    },
    {
      title: `Imagens (${page.images.count})`,
      content: (
        <div className="space-y-1 text-[12px]">
          {page.images.images.length === 0
            ? <p className="text-[#77767b]">Nenhuma imagem encontrada.</p>
            : page.images.images.map((img, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 truncate">{img.name}</span>
                <span className="text-[#77767b]">{img.widthPx}×{img.heightPx}px</span>
                <span className="text-[#77767b]">
                  {img.dpiEffective !== null ? `${img.dpiEffective} DPI` : "DPI n/d"}
                </span>
              </div>
            ))
          }
          {page.images.count > 0 && (
            <p className="text-[11px] text-[#77767b] italic">
              DPI efetivo não calculado — requer análise da matriz CTM.
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Transparência & Overprint",
      content: (
        <div className="space-y-1 text-[12px]">
          <p className={page.transparency.hasTransparency ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
            {page.transparency.hasTransparency ? "Transparência detectada" : "Sem transparência"}
          </p>
          {page.transparency.details.map((d, i) => (
            <p key={i} className="text-[#77767b]">• {d}</p>
          ))}
          <p className={page.overprint.hasOverprint ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
            {page.overprint.hasOverprint ? "Overprint detectado" : "Sem overprint"}
          </p>
        </div>
      ),
    },
    {
      title: "Preto & TAC",
      content: (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {page.black.has100K && <span className="rounded bg-[#f3f3f5] px-2 py-0.5 text-[11px] dark:bg-[#222426]">100% K</span>}
            {page.black.hasRichBlack && (
              <span className={`rounded px-2 py-0.5 text-[11px] ${page.black.richBlackInText ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-[#f3f3f5] dark:bg-[#222426]"}`}>
                Rich Black{page.black.richBlackInText ? " (texto)" : ""}
              </span>
            )}
            {page.black.hasRgbBlack && (
              <span className={`rounded px-2 py-0.5 text-[11px] ${page.black.rgbBlackInText ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                Preto RGB{page.black.rgbBlackInText ? " (texto)" : ""}
              </span>
            )}
            {!page.black.has100K && !page.black.hasRichBlack && !page.black.hasRgbBlack && (
              <span className="text-[12px] text-[#77767b]">Não determinado</span>
            )}
          </div>
          <div className="text-[12px]">
            {page.tac.maxTacPercent !== undefined ? (
              <p className={page.tac.maxTacPercent > 300 ? "text-amber-600 dark:text-amber-400" : "text-[#1a1c1d] dark:text-white"}>
                TAC máx. estimado: {page.tac.maxTacPercent}%
              </p>
            ) : null}
            <p className="text-[11px] text-[#77767b] mt-0.5">{page.tac.note}</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="mt-2 rounded-xl bg-[#f9f9fb] p-4 dark:bg-[#222426] border border-[rgba(199,198,202,0.3)] dark:border-white/8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <div key={s.title}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">{s.title}</p>
            {s.content}
          </div>
        ))}
      </div>

      {page.alerts.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[rgba(199,198,202,0.3)] pt-4 dark:border-white/8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
            Alertas ({page.alerts.length})
          </p>
          {page.alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border p-3 ${alertSeverityBg(alert.severity)}`}>
              {alertIcon(alert.severity)}
              <div className="flex-1">
                <p className="text-[13px] font-semibold">{alert.message}</p>
                {alert.detail && (
                  <p className="mt-0.5 text-[12px] opacity-80">{alert.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pages Table ──────────────────────────────────────────────────────────────
function PagesTable({ pages }: { pages: PageResult[] }) {
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  function toggle(pageNum: number) {
    setExpandedPage((p) => (p === pageNum ? null : pageNum));
  }

  return (
    <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white shadow-sm dark:bg-[#1c1e22] dark:border-white/8 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-5 py-4 dark:border-white/8">
        <h3 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">
          Resultado por Página ({pages.length})
        </h3>
      </div>
      <div className="divide-y divide-[rgba(199,198,202,0.3)] dark:divide-white/8">
        {pages.map((page) => {
          const status = pageRowStatus(page);
          const errorCount = page.alerts.filter((a) => a.severity === "error").length;
          const warnCount  = page.alerts.filter((a) => a.severity === "warning").length;
          const infoCount  = page.alerts.filter((a) => a.severity === "info").length;
          const isExpanded = expandedPage === page.pageNumber;
          const channels = getPageChannels(page.color);

          return (
            <div key={page.pageNumber}>
              <button
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#f9f9fb] dark:hover:bg-[#222426] transition-colors"
                onClick={() => toggle(page.pageNumber)}
              >
                {/* Page number */}
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f3f5] text-[12px] font-bold text-[#1a1c1d] dark:bg-[#222426] dark:text-white">
                  {page.pageNumber}
                </div>

                {/* Size + status */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusPill status={status} />
                    {page.boxes.detectedSize && (
                      <span className="rounded bg-[#f3f3f5] px-2 py-0.5 text-[11px] text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]">
                        {page.boxes.detectedSize}
                      </span>
                    )}
                    {page.isBlank && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                        Em branco
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#77767b]">
                    {fmtDim(page.boxes.finalSize)}
                    {page.boxes.trimBox ? " (TrimBox)" : page.boxes.finalSizeSource === "CropBox" ? " (CropBox)" : " (MediaBox)"}
                    {" · "}
                    {page.boxes.orientation === "portrait" ? "Retrato" : page.boxes.orientation === "landscape" ? "Paisagem" : "Quadrado"}
                    {page.boxes.bleedPerSide && page.boxes.bleedConfirmed
                      ? ` · Sangria: ${fmtMm(
                          Math.min(
                            page.boxes.bleedPerSide.top,
                            page.boxes.bleedPerSide.bottom,
                            page.boxes.bleedPerSide.left,
                            page.boxes.bleedPerSide.right
                          )
                        )} mín.`
                      : page.boxes.trimBox
                      ? " · Sem BleedBox"
                      : ""}
                  </p>
                </div>

                {/* CMYK channel squares */}
                <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
                  <InkSquare ch="C" active={channels.c} size={16} />
                  <InkSquare ch="M" active={channels.m} size={16} />
                  <InkSquare ch="Y" active={channels.y} size={16} />
                  <InkSquare ch="K" active={channels.k} size={16} />
                  {page.color.hasRgb && (
                    <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                      RGB
                    </span>
                  )}
                  {page.transparency.hasTransparency && (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      Transp.
                    </span>
                  )}
                  {page.fonts.some((f) => !f.embedded) && (
                    <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                      Fonte
                    </span>
                  )}
                </div>

                {/* Alert counts */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {errorCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {errorCount}
                    </span>
                  )}
                  {warnCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                      {warnCount}
                    </span>
                  )}
                  {infoCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                      {infoCount}
                    </span>
                  )}
                  {errorCount + warnCount + infoCount === 0 && (
                    <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  <svg
                    className={`h-4 w-4 text-[#77767b] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4">
                  <PageDetailPanel page={page} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Color Errors Section ─────────────────────────────────────────────────────
function ColorErrorsSection({ pages }: { pages: PageResult[] }) {
  const rgbPages = pages.filter((p) => p.color.hasRgb);
  if (rgbPages.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800/40 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-red-200/60 px-4 py-3 dark:border-red-800/30">
        <svg className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">
          Erros de cor — {rgbPages.length} página{rgbPages.length > 1 ? "s" : ""} com RGB detectado
        </p>
      </div>
      <ul className="px-4 py-3 space-y-1">
        {rgbPages.map((p) => (
          <li key={p.pageNumber} className="flex items-start gap-2 text-[12px] text-red-700 dark:text-red-300">
            <span className="mt-0.5 font-bold">•</span>
            <span>
              <strong>Página {p.pageNumber}:</strong> RGB detectado (esperado CMYK)
              {p.color.operatorsFound.some((op) => ["rg", "RG"].includes(op)) && (
                <span className="ml-1 text-[11px] text-red-500 dark:text-red-400">
                  [operadores: {p.color.operatorsFound.filter((op) => ["rg", "RG"].includes(op)).join(", ")}]
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Alerts Panel (tabs: Erros / Avisos / Informações) ────────────────────────
interface AlertItem {
  id: string;
  severity: AlertSeverity;
  code: string;
  message: string;
  detail?: string;
  pageNumber?: number;
  page?: PageResult;
  pageNumbers?: number[];
}

function AlertsPanel({
  globalAlerts,
  pages,
}: {
  globalAlerts: PreflightResult["globalAlerts"];
  pages: PageResult[];
}) {
  type TabKey = "error" | "warning" | "info";

  function buildItems(severity: TabKey): AlertItem[] {
    const globals: AlertItem[] = globalAlerts
      .filter((a) => a.severity === severity)
      .map((a, i) => ({
        id: `g-${severity}-${i}`,
        severity: a.severity,
        code: a.code,
        message: a.message,
        detail: a.detail,
        pageNumbers: a.pageNumbers,
      }));
    const pageItems: AlertItem[] = pages.flatMap((p) =>
      p.alerts
        .filter((a) => a.severity === severity)
        .map((a, i) => ({
          id: `p${p.pageNumber}-${severity}-${i}`,
          severity: a.severity,
          code: a.code,
          message: a.message,
          detail: a.detail,
          pageNumbers: a.pageNumbers,
          pageNumber: p.pageNumber,
          page: p,
        }))
    );
    return [...globals, ...pageItems];
  }

  const allErrors   = buildItems("error");
  const allWarnings = buildItems("warning");
  const allInfos    = buildItems("info");
  const total = allErrors.length + allWarnings.length + allInfos.length;

  const initTab: TabKey =
    allErrors.length > 0 ? "error" : allWarnings.length > 0 ? "warning" : "info";
  const [activeTab, setActiveTab] = useState<TabKey>(initTab);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (total === 0) return null;

  const tabs: {
    key: TabKey;
    label: string;
    items: AlertItem[];
    textCls: string;
    borderCls: string;
    badgeActiveCls: string;
  }[] = (
    [
      {
        key: "error" as TabKey,
        label: "Erros",
        items: allErrors,
        textCls: "text-red-600 dark:text-red-400",
        borderCls: "border-red-500",
        badgeActiveCls: "bg-red-500 text-white",
      },
      {
        key: "warning" as TabKey,
        label: "Avisos",
        items: allWarnings,
        textCls: "text-amber-600 dark:text-amber-400",
        borderCls: "border-amber-500",
        badgeActiveCls: "bg-amber-500 text-white",
      },
      {
        key: "info" as TabKey,
        label: "Informações",
        items: allInfos,
        textCls: "text-blue-600 dark:text-blue-400",
        borderCls: "border-blue-500",
        badgeActiveCls: "bg-blue-500 text-white",
      },
    ] as const
  ).filter((t) => t.items.length > 0) as {
    key: TabKey;
    label: string;
    items: AlertItem[];
    textCls: string;
    borderCls: string;
    badgeActiveCls: string;
  }[];

  const activeTabDef = tabs.find((t) => t.key === activeTab) ?? tabs[0];
  const activeItems  = activeTabDef?.items ?? [];

  return (
    <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white shadow-sm dark:bg-[#1c1e22] dark:border-white/8 overflow-hidden">
      {/* Header + tab row */}
      <div className="flex items-stretch border-b border-[rgba(0,0,0,0.06)] dark:border-white/8">
        <div className="flex items-center border-r border-[rgba(0,0,0,0.06)] px-5 dark:border-white/8 flex-shrink-0">
          <h3 className="whitespace-nowrap text-[15px] font-semibold text-[#1a1c1d] dark:text-white">
            Erros e Alertas
          </h3>
        </div>
        {/* Tabs — overflow-x-auto so many tabs scroll horizontally */}
        <div className="flex overflow-x-auto flex-1 min-w-0">
          {tabs.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setActiveTab(t.key); setExpandedId(null); }}
                className={`relative flex items-center gap-2 px-5 py-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors focus:outline-none ${
                  isActive
                    ? `${t.textCls} bg-[#f9f9fb] dark:bg-[#222426]`
                    : "text-[#77767b] hover:text-[#46464a] hover:bg-[#f3f3f5] dark:hover:text-[#c0c0c4] dark:hover:bg-[#262830]"
                }`}
              >
                {/* Active bottom strip */}
                {isActive && (
                  <span
                    className={`absolute bottom-0 left-0 right-0 h-[3px] rounded-t-sm ${
                      t.key === "error" ? "bg-red-500" : t.key === "warning" ? "bg-amber-500" : "bg-blue-500"
                    }`}
                  />
                )}
                {t.label}
                <span
                  className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    isActive
                      ? t.badgeActiveCls
                      : "bg-[#f3f3f5] text-[#46464a] dark:bg-[#2a2c30] dark:text-[#c0c0c4]"
                  }`}
                >
                  {t.items.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Items list — scrollable up to 480px */}
      <div className="divide-y divide-[rgba(199,198,202,0.2)] overflow-y-auto dark:divide-white/6" style={{ maxHeight: "480px" }}>
        {activeItems.map((item) => {
          const isExpanded    = expandedId === item.id;
          const hasPageDetail = !!item.page;
          const channels      = item.page ? getPageChannels(item.page.color) : null;

          return (
            <div key={item.id}>
              {/* Row */}
              <button
                disabled={!hasPageDetail}
                className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors ${
                  hasPageDetail
                    ? `cursor-pointer hover:bg-[#f9f9fb] dark:hover:bg-[#222426] ${isExpanded ? "bg-[#f9f9fb] dark:bg-[#222426]" : ""}`
                    : "cursor-default"
                }`}
                onClick={() =>
                  hasPageDetail &&
                  setExpandedId((v) => (v === item.id ? null : item.id))
                }
              >
                <div className="mt-0.5 flex-shrink-0">{alertIcon(item.severity)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-[#1a1c1d] dark:text-white">
                    {item.pageNumber !== undefined && (
                      <span className="font-normal text-[#77767b]">
                        Página {item.pageNumber} ·{" "}
                      </span>
                    )}
                    {item.message}
                  </p>
                  {item.detail && (
                    <p className="mt-0.5 text-[12px] text-[#77767b]">{item.detail}</p>
                  )}
                  {/* Quick chips */}
                  {item.page && channels && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <div className="flex items-center gap-0.5">
                        <InkSquare ch="C" active={channels.c} size={14} />
                        <InkSquare ch="M" active={channels.m} size={14} />
                        <InkSquare ch="Y" active={channels.y} size={14} />
                        <InkSquare ch="K" active={channels.k} size={14} />
                        {item.page.color.hasRgb && (
                          <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                            RGB
                          </span>
                        )}
                      </div>
                      <span className="rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[10px] text-[#46464a] dark:bg-[#2a2c30] dark:text-[#c0c0c4]">
                        {fmtDim(item.page.boxes.finalSize)}
                        {item.page.boxes.detectedSize
                          ? ` (${item.page.boxes.detectedSize})`
                          : ""}
                      </span>
                      {item.page.boxes.bleedBox ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-400">
                          Sangria ok
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400">
                          Sem BleedBox
                        </span>
                      )}
                      {!item.page.boxes.trimBox && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400">
                          Sem TrimBox
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {hasPageDetail && (
                  <svg
                    className={`mt-0.5 h-4 w-4 flex-shrink-0 text-[#77767b] transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19.5 8.25-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && item.page && channels && (
                <div className="border-t border-[rgba(199,198,202,0.2)] bg-[#f6f6f8] px-5 py-4 dark:border-white/6 dark:bg-[#1e2024]">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Color channels */}
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                        Cores — Página {item.page.pageNumber}
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-1">
                          <InkSquare ch="C" active={channels.c} />
                          <InkSquare ch="M" active={channels.m} />
                          <InkSquare ch="Y" active={channels.y} />
                          <InkSquare ch="K" active={channels.k} />
                          {item.page.color.hasRgb && (
                            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                              RGB detectado ✗
                            </span>
                          )}
                          {item.page.color.hasSpot && (
                            <span className="ml-1 rounded bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                              Spot
                            </span>
                          )}
                        </div>
                        {item.page.color.colorSpaceNames.length > 0 && (
                          <p className="text-[11px] text-[#77767b]">
                            Espaços:{" "}
                            <span className="font-medium text-[#46464a] dark:text-[#c0c0c4]">
                              {item.page.color.colorSpaceNames.join(", ")}
                            </span>
                          </p>
                        )}
                        {item.page.color.operatorsFound.length > 0 && (
                          <p className="text-[11px] text-[#77767b]">
                            Operadores:{" "}
                            <span className="font-mono text-[10px] font-medium text-[#46464a] dark:text-[#c0c0c4]">
                              {item.page.color.operatorsFound.join(", ")}
                            </span>
                          </p>
                        )}
                        <p className="text-[11px] text-[#77767b]">
                          Confiança:{" "}
                          <span className="font-medium text-[#46464a] dark:text-[#c0c0c4]">
                            {item.page.color.confidence}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Size & bleed */}
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                        Tamanho — Página {item.page.pageNumber}
                      </p>
                      <div className="space-y-1.5 text-[12px]">
                        <div>
                          <span className="text-[#77767b]">Tamanho final: </span>
                          <span className="font-semibold">{fmtDim(item.page.boxes.finalSize)}</span>
                          {item.page.boxes.detectedSize && (
                            <span className="ml-1 rounded bg-[#f3f3f5] px-1.5 py-0.5 text-[10px] dark:bg-[#2a2c30]">
                              {item.page.boxes.detectedSize}
                            </span>
                          )}
                        </div>
                        {item.page.boxes.bleedBox ? (
                          <div>
                            <span className="text-[#77767b]">Com sangria: </span>
                            <span className="font-semibold">{fmtDim(item.page.boxes.bleedBox)}</span>
                          </div>
                        ) : (
                          <p className="text-amber-600 dark:text-amber-400">⚠ BleedBox não definida</p>
                        )}
                        {item.page.boxes.bleedPerSide && item.page.boxes.bleedConfirmed && (
                          <div className="text-[#77767b]">
                            Sangria:{" "}
                            <span className="font-medium text-[#46464a] dark:text-[#c0c0c4]">
                              T:{fmtMm(item.page.boxes.bleedPerSide.top)} ·
                              B:{fmtMm(item.page.boxes.bleedPerSide.bottom)} ·
                              E:{fmtMm(item.page.boxes.bleedPerSide.left)} ·
                              D:{fmtMm(item.page.boxes.bleedPerSide.right)}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-[#77767b]">Orientação: </span>
                          <span>
                            {item.page.boxes.orientation === "portrait"
                              ? "Retrato"
                              : item.page.boxes.orientation === "landscape"
                              ? "Paisagem"
                              : "Quadrado"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* All alerts for this page */}
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                        Alertas desta página ({item.page.alerts.length})
                      </p>
                      {item.page.alerts.length === 0 ? (
                        <p className="text-[12px] text-[#77767b]">Nenhum outro alerta.</p>
                      ) : (
                        <div className="space-y-2">
                          {item.page.alerts.map((a, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span
                                className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                  a.severity === "error"
                                    ? "bg-red-500"
                                    : a.severity === "warning"
                                    ? "bg-amber-500"
                                    : "bg-blue-500"
                                }`}
                              />
                              <div className="min-w-0">
                                <p
                                  className={`text-[12px] font-medium ${
                                    a.severity === "error"
                                      ? "text-red-600 dark:text-red-400"
                                      : a.severity === "warning"
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-blue-600 dark:text-blue-400"
                                  }`}
                                >
                                  {a.message}
                                </p>
                                {a.detail && (
                                  <p className="text-[11px] text-[#77767b]">{a.detail}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Non-embedded fonts */}
                    {item.page.fonts.some((f) => !f.embedded) && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                          Fontes não incorporadas
                        </p>
                        <div className="space-y-1">
                          {item.page.fonts
                            .filter((f) => !f.embedded)
                            .map((f, i) => (
                              <div key={i} className="flex items-center gap-2 text-[12px]">
                                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                                <span className="min-w-0 truncate text-red-600 dark:text-red-400">
                                  {f.name}
                                </span>
                                <span className="flex-shrink-0 text-[#77767b]">{f.type}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Low-res images */}
                    {item.page.images.lowResCount > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">
                          Imagens baixa resolução ({item.page.images.lowResCount})
                        </p>
                        <div className="space-y-1">
                          {item.page.images.images
                            .filter((img) => img.isLowRes)
                            .map((img, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className="min-w-0 truncate text-amber-600 dark:text-amber-400">
                                  {img.name}
                                </span>
                                <span className="flex-shrink-0 text-[#77767b]">
                                  {img.dpiEffective != null
                                    ? `${img.dpiEffective} DPI`
                                    : "DPI n/d"}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Limitations ──────────────────────────────────────────────────────────────
function LimitationsSection({ limitations }: { limitations: string[] }) {
  return (
    <div className="rounded-xl border border-[rgba(199,198,202,0.3)] bg-[#f9f9fb] p-4 dark:bg-[#1c1e22] dark:border-white/8">
      <div className="flex items-center gap-2 mb-3">
        <svg className="h-4 w-4 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <p className="text-[13px] font-semibold text-[#46464a] dark:text-[#a0a0a4]">
          Limitações desta análise
        </p>
      </div>
      <ul className="space-y-1">
        {limitations.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-[#77767b]">
            <span className="mt-0.5 text-[#a0a0a4]">•</span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── PDF/X Info ───────────────────────────────────────────────────────────────
function PdfxSection({ result }: { result: PreflightResult }) {
  const { pdfxInfo, pdfVersion } = result;
  return (
    <div className="flex flex-wrap gap-2">
      {pdfVersion && (
        <div className="rounded-lg border border-[rgba(199,198,202,0.3)] bg-white px-3 py-1.5 dark:bg-[#222426] dark:border-white/8">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b]">PDF</p>
          <p className="text-[12px] font-bold text-[#1a1c1d] dark:text-white">{pdfVersion}</p>
        </div>
      )}
      <div className="rounded-lg border border-[rgba(199,198,202,0.3)] bg-white px-3 py-1.5 dark:bg-[#222426] dark:border-white/8">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b]">OutputIntent</p>
        <p className="text-[12px] font-bold text-[#1a1c1d] dark:text-white">
          {pdfxInfo.hasOutputIntent ? (pdfxInfo.outputIntentProfile ?? "Presente") : "Ausente"}
        </p>
      </div>
      {pdfxInfo.conformance && (
        <div className="rounded-lg border border-[rgba(199,198,202,0.3)] bg-white px-3 py-1.5 dark:bg-[#222426] dark:border-white/8">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77767b]">Conformidade</p>
          <p className="text-[12px] font-bold text-[#1a1c1d] dark:text-white">{pdfxInfo.conformance}</p>
        </div>
      )}
    </div>
  );
}

// ─── History Section ──────────────────────────────────────────────────────────
function HistorySection({
  history,
  onSelect,
  onDelete,
  onClear,
}: {
  history: HistoryRow[];
  onSelect: (row: HistoryRow) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (history.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white shadow-sm dark:bg-[#1c1e22] dark:border-white/8 overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-[#f9f9fb] dark:hover:bg-[#222426] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[#77767b]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">Histórico</h3>
          <span className="rounded-full bg-[#f3f3f5] px-2 py-0.5 text-[11px] font-semibold text-[#46464a] dark:bg-[#222426] dark:text-[#a0a0a4]">
            {history.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="text-[11px] text-[#77767b] hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Limpar tudo
          </button>
          <svg
            className={`h-4 w-4 text-[#77767b] transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-[rgba(199,198,202,0.3)] border-t border-[rgba(0,0,0,0.06)] dark:divide-white/8 dark:border-white/8">
          {history.map((row) => {
            const statusBgCls = statusBg(row.status);
            const statusTextCls = statusColor(row.status);

            return (
              <div key={row.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f9f9fb] dark:hover:bg-[#222426] transition-colors">
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onSelect(row)}
                >
                  <svg className="h-8 w-8 flex-shrink-0 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1a1c1d] dark:text-white">
                      {row.fileName}
                    </p>
                    <p className="text-[11px] text-[#77767b]">
                      {fmtDateTime(row.analyzedAt)} · {row.pageCount} pág. · {fmtFileSize(row.fileSize)}
                      {row.user && (
                        <span className="ml-1.5">· {row.user.name}</span>
                      )}
                      {row.errorCount > 0 && (
                        <span className="ml-1.5 font-semibold text-red-500">
                          {row.errorCount} erro{row.errorCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {row.warnCount > 0 && (
                        <span className="ml-1.5 font-semibold text-amber-500">
                          {row.warnCount} aviso{row.warnCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBgCls} ${statusTextCls}`}>
                    {STATUS_LABEL[row.status]}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(row.id)}
                  className="flex-shrink-0 rounded p-1 text-[#b0b0b4] hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Remover"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Report Generator ─────────────────────────────────────────────────────────
function generateReport(result: PreflightResult): void {
  const s = result.summary;
  const p = result.pdfxInfo;
  const firstPage = result.pages[0];

  const statusLabel = { pass: "APROVADO", warning: "VERIFICAR", error: "REPROVADO" }[s.overallStatus];
  const statusColor = { pass: "#059669", warning: "#d97706", error: "#dc2626" }[s.overallStatus];
  const statusBg    = { pass: "#ecfdf5", warning: "#fffbeb", error: "#fef2f2" }[s.overallStatus];
  const statusBorder= { pass: "#a7f3d0", warning: "#fde68a", error: "#fecaca" }[s.overallStatus];

  // Color separations table
  const groups = groupPagesByChannels(result.pages);
  const colorRows = groups.map((g) => {
    const label = g.startPage === g.endPage ? `Página ${g.startPage}` : `Páginas ${g.startPage}–${g.endPage}`;
    const ch = g.channels;
    const sq = (letter: string, on: boolean) => {
      const bg: Record<string, string> = { C: "#06b6d4", M: "#ec4899", Y: "#eab308", K: "#1a1a1a" };
      const tc: Record<string, string> = { C: "#fff", M: "#fff", Y: "#5a3e00", K: "#fff" };
      const style = on
        ? `background:${bg[letter]};color:${tc[letter]};border-color:${bg[letter]};font-weight:700`
        : `background:#fff;color:#ccc;border-color:#ddd;font-weight:700`;
      return `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid;border-radius:3px;font-size:10px;margin-right:2px;${style}">${letter}</span>`;
    };
    const rgb = g.hasRgb ? `<span style="margin-left:6px;background:#fee2e2;color:#dc2626;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700">RGB</span>` : "";
    return `<tr><td style="padding:6px 12px;font-size:12px;color:#46464a;border-bottom:1px solid #f0f0f0">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${sq("C",ch.c)}${sq("M",ch.m)}${sq("Y",ch.y)}${sq("K",ch.k)}${rgb}</td></tr>`;
  }).join("");

  // Only errors in the report (warnings and info are suppressed)
  const allAlerts = [
    ...result.globalAlerts,
    ...result.pages.flatMap((pg) => pg.alerts.map((a) => ({ ...a, _page: pg.pageNumber }))),
  ].filter((a) => a.severity === "error");

  const alertsHtml = allAlerts.length === 0
    ? `<p style="color:#059669;font-size:13px;font-weight:600">✓ Nenhum erro encontrado.</p>`
    : allAlerts.map((a) => {
        const ac = { error: "#dc2626", warning: "#d97706", info: "#2563eb" }[a.severity];
        const ab = { error: "#fef2f2", warning: "#fffbeb", info: "#eff6ff" }[a.severity];
        const al = { error: "Erro", warning: "Aviso", info: "Info" }[a.severity];
        const page = (a as typeof a & { _page?: number })._page;
        const pageTxt = page !== undefined ? ` — Pág. ${page}` : "";
        return `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:${ab};border-left:3px solid ${ac};border-radius:0 6px 6px 0;margin-bottom:6px">
          <span style="background:${ac};color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;white-space:nowrap;margin-top:1px">${al}${pageTxt}</span>
          <div><p style="margin:0;font-size:12px;font-weight:600;color:#1a1c1d">${a.message}</p>${a.detail ? `<p style="margin:2px 0 0;font-size:11px;color:#77767b">${a.detail}</p>` : ""}</div>
        </div>`;
      }).join("");

  // Flags
  const flag = (ok: boolean, label: string) => {
    const c = ok ? "#059669" : "#dc2626";
    const bg = ok ? "#ecfdf5" : "#fef2f2";
    const icon = ok ? "✓" : "✗";
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:${bg};color:${c};border:1px solid ${ok?"#a7f3d0":"#fecaca"};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;margin:3px 4px 3px 0"><span style="font-weight:700">${icon}</span>${label}</span>`;
  };

  const bleedTxt = firstPage?.boxes.hasBleed
    ? (firstPage.boxes.bleedPerSide
        ? `${firstPage.boxes.bleedPerSide.top.toFixed(1)} mm (T) · ${firstPage.boxes.bleedPerSide.bottom.toFixed(1)} mm (B) · ${firstPage.boxes.bleedPerSide.left.toFixed(1)} mm (E) · ${firstPage.boxes.bleedPerSide.right.toFixed(1)} mm (D)`
        : `${firstPage.boxes.bleedMm?.toFixed(1) ?? "??"} mm`)
    : "Sem sangria";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Relatório Preflight — ${result.fileName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1c1d;background:#fff;font-size:13px;line-height:1.5}
  .page{max-width:800px;margin:0 auto;padding:32px 32px 48px}
  .print-btn{position:fixed;top:16px;right:16px;background:#005cba;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:14px;font-weight:600;cursor:pointer;z-index:999}
  .print-btn:hover{background:#004fa0}
  h1{font-size:22px;font-weight:800;color:#1a1c1d}
  h2{font-size:14px;font-weight:700;color:#1a1c1d;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #f0f0f0;display:flex;align-items:center;gap:6px}
  .section{margin-bottom:24px}
  .meta{color:#77767b;font-size:12px;margin-top:3px}
  .badge{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;border:1.5px solid}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .card{background:#f9f9fb;border:1px solid #e8e8ea;border-radius:10px;padding:12px 14px}
  .card-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#77767b;margin-bottom:2px}
  .card-value{font-size:16px;font-weight:800;color:#1a1c1d}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#77767b;padding:6px 12px;background:#f9f9fb;border-bottom:1px solid #e8e8ea}
  .divider{height:1px;background:#f0f0f0;margin:20px 0}
  .footer{margin-top:32px;border-top:1px solid #e8e8ea;padding-top:14px;font-size:11px;color:#a0a0a4;display:flex;justify-content:space-between}
  @media print{
    .print-btn{display:none}
    body{font-size:11px}
    .page{padding:0;max-width:100%}
    .section{margin-bottom:16px}
    h1{font-size:18px}
    .card-value{font-size:14px}
    @page{margin:18mm 14mm}
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
<div class="page">

  <!-- Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e8e8ea">
    <div>
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#005cba;margin-bottom:4px">Grafinorte · Preflight</p>
      <h1>Relatório de Análise</h1>
      <p class="meta">${result.fileName} · ${fmtFileSize(result.fileSize)} · ${s.pageCount} página${s.pageCount !== 1 ? "s" : ""}</p>
      <p class="meta">Analisado em ${fmtDateTime(result.analyzedAt)}${result.creatorApp && result.creatorApp !== "Desconhecido" ? ` · Criado em ${result.creatorApp}` : ""}</p>
    </div>
    <div style="text-align:right;flex-shrink:0;margin-left:16px">
      <span class="badge" style="background:${statusBg};color:${statusColor};border-color:${statusBorder};font-size:15px;padding:6px 18px">${statusLabel}</span>
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
        ${s.errorCount > 0 ? `<span style="background:#fef2f2;color:#dc2626;border-radius:8px;padding:2px 10px;font-size:12px;font-weight:700">${s.errorCount} erro${s.errorCount !== 1 ? "s" : ""}</span>` : ""}
        ${s.warningCount > 0 ? `<span style="background:#fffbeb;color:#d97706;border-radius:8px;padding:2px 10px;font-size:12px;font-weight:700">${s.warningCount} aviso${s.warningCount !== 1 ? "s" : ""}</span>` : ""}
        ${s.errorCount === 0 && s.warningCount === 0 ? `<span style="background:#ecfdf5;color:#059669;border-radius:8px;padding:2px 10px;font-size:12px;font-weight:700">Sem problemas</span>` : ""}
      </div>
    </div>
  </div>

  <!-- File Info + Flags -->
  <div class="section">
    <h2>Informações do Arquivo</h2>
    <div class="grid2" style="margin-bottom:12px">
      <div class="card">
        <div class="card-label">Tamanho final</div>
        <div class="card-value">${firstPage ? fmtDim(firstPage.boxes.finalSize) : "—"}</div>
        ${firstPage?.boxes.detectedSize ? `<div style="font-size:11px;color:#77767b;margin-top:2px">${firstPage.boxes.detectedSize}</div>` : ""}
      </div>
      <div class="card">
        <div class="card-label">Sangria</div>
        <div class="card-value" style="font-size:13px">${bleedTxt}</div>
      </div>
      <div class="card">
        <div class="card-label">PDF / Conformidade</div>
        <div class="card-value" style="font-size:13px">${result.pdfVersion ?? "—"} · ${p.conformance ?? "PDF padrão"}</div>
      </div>
      <div class="card">
        <div class="card-label">OutputIntent</div>
        <div class="card-value" style="font-size:13px">${p.hasOutputIntent ? (p.outputIntentProfile ?? "Presente") : "Ausente"}</div>
      </div>
    </div>
    <div>
      ${flag(!s.hasRgbColors, "CMYK apenas")}
      ${flag(!s.hasNonEmbeddedFonts, "Fontes incorporadas")}
      ${flag(!s.hasTransparency, "Sem transparência")}
      ${flag(!s.hasOverprint, "Sem overprint")}
      ${flag(p.hasOutputIntent, "OutputIntent")}
      ${flag(firstPage?.boxes.hasBleed ?? false, "Sangria ok")}
    </div>
  </div>

  <div class="divider"></div>

  <!-- Color Separations -->
  <div class="section">
    <h2>Separações de Cor</h2>
    <table>
      <thead><tr><th>Páginas</th><th>Canais</th></tr></thead>
      <tbody>${colorRows}</tbody>
    </table>
  </div>

  <div class="divider"></div>

  <!-- Alerts -->
  <div class="section">
    <h2>Erros <span style="font-weight:400;font-size:12px;color:#77767b">(${allAlerts.length})</span></h2>
    ${alertsHtml}
  </div>

  <div class="footer">
    <span>Grafinorte · Sistema de Preflight Automático</span>
    <span>Gerado em ${new Date().toLocaleString("pt-BR")}</span>
  </div>

</div>
<script>
  // Auto-print after a short delay to allow styles to load
  // window.onload = () => setTimeout(() => window.print(), 400);
</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Result View ──────────────────────────────────────────────────────────────
function ResultView({ result, onReset }: { result: PreflightResult; onReset: () => void }) {
  return (
    <div className="space-y-6">
      {/* File info bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgba(199,198,202,0.3)] bg-white px-4 py-3 dark:bg-[#1c1e22] dark:border-white/8">
        <svg className="h-5 w-5 flex-shrink-0 text-[#005cba]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#1a1c1d] dark:text-white truncate max-w-[300px]">
            {result.fileName}
          </p>
          <p className="text-[11px] text-[#77767b]">
            Peso: {fmtFileSize(result.fileSize)} · {result.summary.pageCount} página(s) · Analisado em {fmtDateTime(result.analyzedAt)}
          </p>
        </div>

        {/* Creator app badge */}
        {result.creatorApp && result.creatorApp !== "Desconhecido" && (
          <div className="flex-shrink-0 rounded-lg border border-[rgba(199,198,202,0.4)] bg-[#f9f9fb] px-3 py-1.5 dark:bg-[#222426] dark:border-white/8">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[#77767b]">Criado em</p>
            <p className="text-[12px] font-bold text-[#1a1c1d] dark:text-white">{result.creatorApp}</p>
          </div>
        )}

        <div className="flex items-center gap-3 flex-shrink-0">
          <PdfxSection result={result} />
          <button
            onClick={() => generateReport(result)}
            className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.5)] bg-[#005cba] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#004fa0]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <span className="hidden sm:inline">Gerar Relatório</span>
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-xl border border-[rgba(199,198,202,0.5)] px-3 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-[#222426] dark:border-white/10"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span className="hidden sm:inline">Analisar outro PDF</span>
          </button>
        </div>
      </div>

      {/* Summary cards — scrollable strip */}
      <SummaryCards result={result} />

      {/* Physical size card */}
      <PhysicalSizeCard result={result} />

      {/* Color visualization */}
      <ColorVisualization pages={result.pages} />

      {/* Quick flags */}
      <div className="flex flex-wrap gap-2">
        <FlagBadge ok={!result.summary.hasRgbColors}         label="CMYK apenas" />
        <FlagBadge ok={!result.summary.hasNonEmbeddedFonts}  label="Fontes incorporadas" />
        <FlagBadge ok={!result.summary.hasLowResImages}       label="Imagens (DPI n/a)" />
        <FlagBadge ok={!result.summary.hasTransparency}       label="Sem transparência" />
        <FlagBadge ok={!result.summary.hasOverprint}          label="Sem overprint" />
        <FlagBadge ok={result.pdfxInfo.hasOutputIntent}       label="OutputIntent" />
      </div>

      {/* Color errors section (quick overview) */}
      <ColorErrorsSection pages={result.pages} />

      {/* Errors & Alerts panel — separated tabs, clickable items */}
      <AlertsPanel globalAlerts={result.globalAlerts} pages={result.pages} />

      {/* Pages table */}
      <PagesTable pages={result.pages} />

      {/* Limitations */}
      <LimitationsSection limitations={result.limitations} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function PreflightPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<PreflightResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistoryFromApi = useCallback(async () => {
    try {
      const rows = await fetchHistory();
      setHistory(rows);
    } catch {
      // silently ignore — history is optional
    }
  }, []);

  useEffect(() => {
    loadHistoryFromApi();
  }, [loadHistoryFromApi]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await analyzePdf(file);
      setResult(res);
      // Refresh history after successful analysis (server saved it)
      loadHistoryFromApi();
    } catch (err) {
      if (err instanceof PreflightApiError) {
        setError(err.message);
      } else {
        setError("Erro ao analisar o PDF. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
  }

  function handleSelectHistory(row: HistoryRow) {
    try {
      const parsed = JSON.parse(row.resultJson) as PreflightResult;
      setResult(parsed);
      setError(null);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Não foi possível carregar o resultado do histórico.");
    }
  }

  async function handleDeleteHistory(id: string) {
    try {
      await apiDeleteHistory(id);
      setHistory((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silently ignore
    }
  }

  async function handleClearHistory() {
    try {
      await apiClearHistory();
      setHistory([]);
    } catch {
      // silently ignore
    }
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
    <div className="space-y-6 px-4 py-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[#1a1c1d] dark:text-white">
          Preflight PDF
        </h1>
        <p className="mt-0.5 text-[13px] text-[#77767b]">
          Análise técnica de arquivos PDF para impressão — dimensões físicas, sangria, cores, fontes e mais.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div>
            <p className="text-[14px] font-semibold">Erro ao analisar</p>
            <p className="mt-0.5 text-[13px]">{error}</p>
          </div>
        </div>
      )}

      {/* Result or Upload */}
      {result ? (
        <ResultView result={result} onReset={handleReset} />
      ) : (
        <>
          <UploadArea onFile={handleFile} loading={loading} />

          <HistorySection
            history={history}
            onSelect={handleSelectHistory}
            onDelete={handleDeleteHistory}
            onClear={handleClearHistory}
          />
        </>
      )}
    </div>
    </div>
  );
}
