import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  colorProofApi, computeCost, coverageBand, INK_COLORS, INK_INFO, STANDARD_WIDTH_MM,
  type ColorProof, type ColorProofInput, type ColorProofSettings, type InkColor, type PanelJob,
} from "../api/colorProof";

// ─── Formatação (padrão BR) ───────────────────────────────────────────────────
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (n: number, d: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/** Aceita "0,123", "0.123" e "1.234,5" */
function parseNum(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}
const toField = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function currentMonth() { return todayIso().slice(0, 7); }

// ─── Formulário ───────────────────────────────────────────────────────────────
interface FormState {
  date: string; label: string; isBatch: boolean;
  paperM2: string; inkMl: string; widthMm: string; lengthMm: string;
  colors: Record<InkColor, string>; notes: string;
}
const emptyColors = () => Object.fromEntries(INK_COLORS.map((c) => [c, ""])) as Record<InkColor, string>;
const emptyForm = (): FormState => ({
  date: todayIso(), label: "", isBatch: false, paperM2: "", inkMl: "", widthMm: toField(STANDARD_WIDTH_MM), lengthMm: "",
  colors: emptyColors(), notes: "",
});
function formFromProof(p: ColorProof): FormState {
  const colors = emptyColors();
  for (const c of INK_COLORS) colors[c] = toField(p.inkByColor?.[c] ?? null);
  return {
    date: p.date.slice(0, 10), label: p.label, isBatch: p.isBatch,
    paperM2: toField(p.paperM2), inkMl: toField(p.inkMl), widthMm: toField(p.widthMm), lengthMm: toField(p.lengthMm),
    colors, notes: p.notes ?? "",
  };
}
function formToInput(f: FormState): ColorProofInput {
  const inkByColor: Partial<Record<InkColor, number>> = {};
  for (const c of INK_COLORS) { const v = parseNum(f.colors[c]); if (v > 0) inkByColor[c] = v; }
  const opt = (s: string) => { const v = parseNum(s); return v > 0 ? v : null; };
  return {
    date: f.date, label: f.label.trim(), isBatch: f.isBatch,
    paperM2: parseNum(f.paperM2), inkMl: parseNum(f.inkMl),
    widthMm: opt(f.widthMm), lengthMm: opt(f.lengthMm),
    inkByColor: Object.keys(inkByColor).length ? inkByColor : null,
    notes: f.notes.trim() || null,
  };
}

// ─── Observações automáticas e linha da planilha ──────────────────────────────
function autoNotes(p: Pick<ColorProof, "colorsIncomplete" | "widthMm" | "isBatch" | "notes">) {
  const parts: string[] = [];
  if (p.colorsIncomplete) parts.push("cores incompletas");
  if (p.widthMm && Math.abs(p.widthMm - STANDARD_WIDTH_MM) > 0.5) parts.push(`largura ${fmt(p.widthMm, 1)} mm`);
  if (p.notes) parts.push(p.notes);
  return parts.join("; ");
}
function dominantText(p: ColorProof) {
  if (!p.dominantColor || !p.inkByColor) return "";
  const sum = Object.values(p.inkByColor).reduce((s, v) => s + (v ?? 0), 0);
  const v = p.inkByColor[p.dominantColor] ?? 0;
  return sum > 0 ? `${p.dominantColor} (${fmt((v / sum) * 100, 0)}%)` : p.dominantColor;
}
const SHEET_HEADER = ["Data", "OS/Cliente", "Papel (m²)", "Tinta (ml)", "Custo tinta", "Custo papel", "Manutenção", "Custo total", "Custo/m²", "Cobertura (ml/m²)", "Cor dominante", "Obs"];
function sheetRow(p: ColorProof): string[] {
  return [
    fmtDate(p.date), p.label, fmt(p.paperM2, 3), fmt(p.inkMl, 3),
    fmt(p.inkCost, 2), fmt(p.paperCost, 2), fmt(p.maintenanceCost, 2), fmt(p.totalCost, 2),
    fmt(p.costPerM2, 2), fmt(p.coverage, 3), dominantText(p), autoNotes(p),
  ];
}

// ─── UI base ──────────────────────────────────────────────────────────────────
const card = "rounded-2xl border border-[rgba(199,198,202,0.3)] bg-white dark:border-white/10 dark:bg-[#1c1e22]";
const inputCls = "w-full rounded-lg border border-[rgba(199,198,202,0.6)] bg-white px-3 py-2 text-[13px] text-[#1a1c1d] placeholder-[#a0a0a4] focus:border-[#005cba] focus:outline-none focus:ring-2 focus:ring-[#005cba]/15 dark:border-white/10 dark:bg-[#141518] dark:text-white dark:focus:border-[#4d9fff]";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b] dark:text-[#a0a0a4]">{label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums text-[#1a1c1d] dark:text-white">{value}</p>
      {hint && <p className="text-[11px] text-[#77767b] dark:text-[#a0a0a4]">{hint}</p>}
    </div>
  );
}

function Swatch({ color }: { color: InkColor }) {
  return <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ backgroundColor: INK_INFO[color].swatch }} />;
}

// ─── Leitura das fotos do painel pela IA ──────────────────────────────────────
/** Reduz a foto (máx. 2200 px, JPEG) para enviar rápido sem perder a leitura dos números */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não consegui abrir a foto."));
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      // Formato que o navegador não abre (ex.: HEIC do iPhone): manda o original
      img.onerror = () => resolve(src);
      img.onload = () => {
        const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

const sumOrNull = (vals: (number | null)[]) => (vals.some((v) => v !== null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null);
const r3 = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);

/** Lote gangado: soma papel, tinta e cores de todos os trabalhos lidos */
function mergeJobs(jobs: PanelJob[]): PanelJob {
  const inkByColor = Object.fromEntries(INK_COLORS.map((c) => [c, r3(sumOrNull(jobs.map((j) => j.inkByColor[c])))])) as Record<InkColor, number | null>;
  return {
    label: null, date: jobs.find((j) => j.date)?.date ?? null,
    paperM2: r3(sumOrNull(jobs.map((j) => j.paperM2))), inkMl: r3(sumOrNull(jobs.map((j) => j.inkMl))),
    widthMm: jobs.find((j) => j.widthMm)?.widthMm ?? null, lengthMm: r3(sumOrNull(jobs.map((j) => j.lengthMm))),
    inkByColor, illegible: jobs.flatMap((j) => j.illegible),
  };
}

function PhotoReader({ onFill, disabled }: { onFill: (job: PanelJob, info: { photos: number; batchLabel?: string; questions: string[] }) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<{ jobs: PanelJob[]; questions: string[]; photos: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  async function read(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!imgs.length || busy) return;
    setBusy(true);
    setError("");
    setChoice(null);
    try {
      const data = await Promise.all(imgs.slice(0, 10).map(shrinkImage));
      setThumbs(data);
      const res = await colorProofApi.readPhotos(data);
      if (res.jobs.length === 0) {
        setError(res.questions[0] ?? "Não encontrei os dados do painel nessas fotos. Confira se é a tela “Exibir histórico trabalho”.");
      } else if (res.jobs.length === 1) {
        onFill(res.jobs[0], { photos: data.length, questions: res.questions });
        setThumbs([]);
      } else {
        setChoice({ jobs: res.jobs, questions: res.questions, photos: data.length });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler as fotos.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Colar print/foto com Ctrl+V em qualquer lugar da página
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length && !disabled) { e.preventDefault(); read(files); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const pick = (job: PanelJob, batchLabel?: string) => {
    if (!choice) return;
    onFill(job, { photos: choice.photos, batchLabel, questions: choice.questions });
    setChoice(null);
    setThumbs([]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); read([...e.dataTransfer.files]); }}
      className={`mb-4 rounded-xl border-2 border-dashed p-4 transition-colors ${dragging ? "border-[#005cba] bg-[#005cba]/5" : "border-[rgba(199,198,202,0.7)] dark:border-white/15"}`}
    >
      <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple capture="environment" className="hidden"
        onChange={(e) => read([...(e.target.files ?? [])])} />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => fileRef.current?.click()} disabled={busy || disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-[#005cba] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#004a96] disabled:opacity-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" /></svg>
          {busy ? "Lendo as fotos..." : "Enviar fotos do painel"}
        </button>
        <p className="min-w-0 flex-1 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">
          Fotos da tela <b>“Exibir histórico trabalho”</b> da Canon — pode mandar várias (papel, tinta, cores, nome do documento).
          A IA lê e preenche o formulário; você confere e lança. Também dá para arrastar as fotos aqui ou colar com Ctrl+V.
        </p>
      </div>

      {thumbs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {thumbs.map((t, i) => (
            <img key={i} src={t} alt={`Foto ${i + 1}`} className={`h-16 w-16 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10 ${busy ? "animate-pulse" : ""}`} />
          ))}
        </div>
      )}
      {busy && <p className="mt-2 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">A IA está lendo os números do painel — pode levar até 1 minuto.</p>}
      {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}

      {choice && (
        <div className="mt-3 rounded-lg bg-[#f6f7f9] p-3 dark:bg-[#141518]">
          <p className="mb-2 text-[12.5px] font-semibold text-[#1a1c1d] dark:text-white">Encontrei {choice.jobs.length} trabalhos nas fotos. Qual lançar?</p>
          <div className="flex flex-col gap-1.5">
            {choice.jobs.map((j, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-[12.5px] ring-1 ring-[rgba(199,198,202,0.4)] dark:bg-[#1c1e22] dark:ring-white/10">
                <span className="font-medium text-[#1a1c1d] dark:text-white">{j.label ?? `Trabalho ${i + 1} (sem nome)`}</span>
                <span className="text-[#77767b] tabular-nums">
                  {j.paperM2 !== null ? `${fmt(j.paperM2, 3)} m²` : "papel ?"} · {j.inkMl !== null ? `${fmt(j.inkMl, 3)} ml` : "tinta ?"}
                </span>
                <button onClick={() => pick(j)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#005cba] hover:bg-[#005cba]/10 dark:text-[#4d9fff]">Usar este</button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const d = todayIso();
              const names = choice.jobs.map((j, i) => j.label ?? `Trabalho ${i + 1}`).join(" / ");
              pick(mergeJobs(choice.jobs), `Lote ${d.slice(8, 10)}/${d.slice(5, 7)} — ${names}`);
            }}
            className="mt-2 rounded-lg border border-[#005cba] px-3 py-1.5 text-[12px] font-semibold text-[#005cba] hover:bg-[#005cba]/10 dark:border-[#4d9fff] dark:text-[#4d9fff]">
            Rodaram juntos na mesma folha — lançar como um lote só
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export function ColorProofPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [month, setMonth] = useState(currentMonth());
  const [proofs, setProofs] = useState<ColorProof[]>([]);
  const [settings, setSettings] = useState<ColorProofSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<ColorProof | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showColors, setShowColors] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<{ photos: number; warnings: string[] } | null>(null);

  // A IA só preenche; o operador confere e lança
  function fillFromPanel(job: PanelJob, info: { photos: number; batchLabel?: string; questions: string[] }) {
    const colors = emptyColors();
    for (const c of INK_COLORS) colors[c] = toField(job.inkByColor[c]);
    setForm((f) => ({
      ...f,
      date: job.date ?? f.date,
      label: info.batchLabel ?? job.label ?? f.label,
      isBatch: !!info.batchLabel || f.isBatch,
      paperM2: toField(job.paperM2),
      inkMl: toField(job.inkMl),
      widthMm: job.widthMm !== null ? toField(job.widthMm) : f.widthMm,
      lengthMm: toField(job.lengthMm),
      colors,
    }));
    const missing = [
      job.paperM2 === null && "papel consumido (m²)",
      job.inkMl === null && "total de tinta (ml)",
      !info.batchLabel && job.label === null && "nome do documento / OS",
    ].filter(Boolean) as string[];
    setAiNotice({
      photos: info.photos,
      warnings: [
        ...(missing.length ? [`Não consegui ler: ${missing.join(", ")}. Preencha à mão ou mande outra foto.`] : []),
        ...job.illegible,
        ...info.questions,
      ],
    });
    setShowColors(true);
    setFormError("");
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      let from: string | undefined, to: string | undefined;
      if (month) {
        const [y, m] = month.split("-").map(Number);
        from = `${month}-01`;
        to = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
      }
      const [list, s] = await Promise.all([colorProofApi.list(from, to), settings ? Promise.resolve(settings) : colorProofApi.getSettings()]);
      setProofs(list);
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar as provas.");
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [month]);

  // Preços do cálculo: os gravados na prova (edição) ou os atuais (nova)
  const prices = editing
    ? { inkPricePerMl: editing.inkPricePerMl, paperPricePerM2: editing.paperPricePerM2, maintenancePct: editing.maintenancePct }
    : settings
    ? { inkPricePerMl: settings.cartridgePrice / settings.cartridgeMl, paperPricePerM2: settings.paperPricePerM2, maintenancePct: settings.maintenancePct }
    : null;

  const input = formToInput(form);
  const valid = !!input.label && input.paperM2 > 0 && input.inkMl > 0 && !!input.date;
  const preview = prices && input.paperM2 > 0 && input.inkMl > 0 ? computeCost(input, prices) : null;
  const widthOff = input.widthMm !== null && Math.abs(input.widthMm - STANDARD_WIDTH_MM) > 0.5;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setFormError("");
    try {
      if (editing) await colorProofApi.update(editing.id, input);
      else await colorProofApi.create(input);
      setForm(emptyForm());
      setEditing(null);
      setAiNotice(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: ColorProof) {
    if (!confirm(`Excluir a prova "${p.label}" de ${fmtDate(p.date)}?`)) return;
    try {
      await colorProofApi.remove(p.id);
      if (editing?.id === p.id) { setEditing(null); setForm(emptyForm()); }
      setProofs((ps) => ps.filter((x) => x.id !== p.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  function startEdit(p: ColorProof) {
    setEditing(p);
    setForm(formFromProof(p));
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("cp-top")?.scrollIntoView({ behavior: "smooth" });
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      alert("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  function exportCsv() {
    // ";" e vírgula decimal: abre certo no Excel em português
    const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [SHEET_HEADER, ...[...proofs].reverse().map(sheetRow)].map((r) => r.map(esc).join(";"));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `teste-de-cor-${month || "tudo"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Totais do período
  const totals = useMemo(() => {
    const paper = proofs.reduce((s, p) => s + p.paperM2, 0);
    const ink = proofs.reduce((s, p) => s + p.inkMl, 0);
    const cost = proofs.reduce((s, p) => s + p.totalCost, 0);
    const byColor = Object.fromEntries(INK_COLORS.map((c) => [c, 0])) as Record<InkColor, number>;
    let withColors = 0;
    for (const p of proofs) {
      if (!p.inkByColor) continue;
      withColors++;
      for (const c of INK_COLORS) byColor[c] += p.inkByColor[c] ?? 0;
    }
    const colorTotal = INK_COLORS.reduce((s, c) => s + byColor[c], 0);
    const ranked = [...INK_COLORS].sort((a, b) => byColor[b] - byColor[a]);
    return { paper, ink, cost, perM2: paper > 0 ? cost / paper : 0, coverage: paper > 0 ? ink / paper : 0, byColor, colorTotal, ranked, withColors };
  }, [proofs]);

  const band = preview ? coverageBand(preview.coverage) : null;

  return (
    <div id="cp-top" className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
        {/* Cabeçalho */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1c1d] dark:text-white">Teste de cor</h1>
            <p className="text-[13px] text-[#77767b] dark:text-[#a0a0a4]">Custo das provas da Canon imagePROGRAF PRO-2600, pelos dados do painel “Exibir histórico trabalho”.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} title="Mês"
              className="rounded-lg border border-[rgba(199,198,202,0.6)] bg-white px-3 py-2 text-[13px] text-[#1a1c1d] focus:border-[#005cba] focus:outline-none dark:border-white/10 dark:bg-[#141518] dark:text-white dark:[color-scheme:dark]" />
            <button onClick={() => setMonth("")} className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${month === "" ? "border-[#005cba] bg-[#005cba]/10 text-[#005cba] dark:text-[#4d9fff]" : "border-[rgba(199,198,202,0.6)] text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-white/5"}`}>
              Tudo
            </button>
            <button onClick={() => setShowSettings(true)} className="rounded-lg border border-[rgba(199,198,202,0.6)] px-3 py-2 text-[12px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-white/5">
              Preços
            </button>
          </div>
        </div>

        {/* Totais do período */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Provas" value={String(proofs.length)} hint={month ? "no mês" : "no total"} />
          <Kpi label="Papel" value={`${fmt(totals.paper, 3)} m²`} />
          <Kpi label="Tinta" value={`${fmt(totals.ink, 3)} ml`} />
          <Kpi label="Custo total" value={brl(totals.cost)} />
          <Kpi label="Custo médio" value={`${brl(totals.perM2)}/m²`} hint="referência ~R$ 68/m²" />
          <Kpi label="Cobertura média" value={`${fmt(totals.coverage, 2)} ml/m²`} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Formulário */}
          <div className={`${card} p-5`}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">{editing ? `Editando: ${editing.label}` : "Nova prova"}</h2>
              {editing && (
                <button onClick={() => { setEditing(null); setForm(emptyForm()); setFormError(""); setAiNotice(null); }} className="text-[12px] font-medium text-[#77767b] hover:text-[#1a1c1d] dark:hover:text-white">
                  Cancelar edição
                </button>
              )}
            </div>

            <PhotoReader onFill={fillFromPanel} disabled={saving} />

            {aiNotice && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    Preenchido pela IA a partir de {aiNotice.photos} foto{aiNotice.photos > 1 ? "s" : ""}. Confira cada número com o painel antes de lançar.
                  </p>
                  <button onClick={() => setAiNotice(null)} title="Fechar aviso" className="text-amber-700 hover:text-amber-900 dark:text-amber-300">✕</button>
                </div>
                {aiNotice.warnings.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-5">
                    {aiNotice.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <label className={labelCls}>Data</label>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>OS / Cliente</label>
                <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={form.isBatch ? `Lote ${todayIso().slice(8, 10)}/${todayIso().slice(5, 7)} — Cliente A / Cliente B` : "Ex.: OS 1234 — Sorveteria Mizpa"} className={inputCls} />
              </div>
            </div>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[12px] text-[#46464a] dark:text-[#a0a0a4]">
              <input type="checkbox" checked={form.isBatch} onChange={(e) => setForm((f) => ({ ...f, isBatch: e.target.checked }))} className="h-3.5 w-3.5 accent-[#005cba]" />
              Lote gangado (vários clientes na mesma folha) — some o papel e a tinta de todos os trabalhos do lote
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className={labelCls}>Papel consumido (m²)</label>
                <input inputMode="decimal" value={form.paperM2} onChange={(e) => setForm((f) => ({ ...f, paperM2: e.target.value }))} placeholder="0,000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Total de tinta (ml)</label>
                <input inputMode="decimal" value={form.inkMl} onChange={(e) => setForm((f) => ({ ...f, inkMl: e.target.value }))} placeholder="0,000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Largura (mm)</label>
                <input inputMode="decimal" value={form.widthMm} onChange={(e) => setForm((f) => ({ ...f, widthMm: e.target.value }))} className={inputCls + (widthOff ? " border-amber-400 dark:border-amber-500" : "")} />
              </div>
              <div>
                <label className={labelCls}>Comprimento (mm)</label>
                <input inputMode="decimal" value={form.lengthMm} onChange={(e) => setForm((f) => ({ ...f, lengthMm: e.target.value }))} placeholder="opcional" className={inputCls} />
              </div>
            </div>

            {/* Consumo por cor */}
            <div className="mt-4 rounded-xl border border-[rgba(199,198,202,0.4)] dark:border-white/10">
              <button onClick={() => setShowColors((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left">
                <span className="text-[12px] font-semibold text-[#1a1c1d] dark:text-white">Consumo de tinta por cor (ml) <span className="font-normal text-[#77767b]">— opcional, confere o total</span></span>
                <svg className={`h-4 w-4 text-[#77767b] transition-transform ${showColors ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showColors && (
                <div className="grid grid-cols-3 gap-2 border-t border-[rgba(199,198,202,0.4)] p-3 sm:grid-cols-4 lg:grid-cols-6 dark:border-white/10">
                  {INK_COLORS.map((c) => (
                    <div key={c}>
                      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#46464a] dark:text-[#a0a0a4]" title={INK_INFO[c].name}>
                        <Swatch color={c} /> {c}
                      </label>
                      <input inputMode="decimal" value={form.colors[c]} onChange={(e) => setForm((f) => ({ ...f, colors: { ...f.colors, [c]: e.target.value } }))}
                        placeholder="0,000" className={inputCls + " px-2 py-1.5"} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className={labelCls}>Observação</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="opcional" className={inputCls} />
            </div>

            {/* Resultado ao vivo */}
            <div className="mt-5 rounded-xl bg-[#f6f7f9] p-4 dark:bg-[#141518]">
              {!preview ? (
                <p className="text-[13px] text-[#77767b] dark:text-[#a0a0a4]">Preencha o papel (m²) e a tinta (ml) para ver o custo.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77767b]">Custo total</p>
                      <p className="text-[28px] font-bold tabular-nums text-[#1a1c1d] dark:text-white">{brl(preview.totalCost)}</p>
                      <p className="text-[12px] text-[#77767b] dark:text-[#a0a0a4]">{brl(preview.costPerM2)}/m² · cobertura {fmt(preview.coverage, 3)} ml/m²</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-right text-[12px]">
                      <div><p className="text-[#77767b]">Tinta</p><p className="font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{brl(preview.inkCost)}</p></div>
                      <div><p className="text-[#77767b]">Papel</p><p className="font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{brl(preview.paperCost)}</p></div>
                      <div><p className="text-[#77767b]">Manutenção</p><p className="font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{brl(preview.maintenanceCost)}</p></div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                    {preview.hasColors && (
                      preview.colorsIncomplete ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Soma das cores {fmt(preview.colorSum, 3)} ml ≠ total {fmt(input.inkMl, 3)} ml — vai como “cores incompletas” (o custo usa o total)
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Soma das cores bate com o total ✓</span>
                      )
                    )}
                    {preview.dominantColor && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-medium text-[#46464a] ring-1 ring-[rgba(199,198,202,0.5)] dark:bg-[#1c1e22] dark:text-[#d0d0d4] dark:ring-white/10">
                        <Swatch color={preview.dominantColor} /> Cor dominante: {preview.dominantColor} ({fmt(preview.dominantPct ?? 0, 1)}%)
                      </span>
                    )}
                    {widthOff && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Largura diferente de 609,6 mm (24")</span>
                    )}
                    {band && (
                      <span className={`rounded-full px-2.5 py-1 font-medium ${band.tone === "warn" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-[#005cba]/10 text-[#005cba] dark:text-[#4d9fff]"}`}>{band.label}</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {formError && <p className="mt-3 text-[13px] text-red-600">{formError}</p>}
            <div className="mt-4 flex justify-end">
              <button onClick={submit} disabled={!valid || saving}
                className="rounded-lg bg-[#005cba] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#004a96] disabled:cursor-not-allowed disabled:opacity-40">
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Lançar prova"}
              </button>
            </div>
          </div>

          {/* Lateral: consumo por cor e referências */}
          <div className="flex flex-col gap-5">
            <div className={`${card} p-5`}>
              <h2 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">Consumo por cor</h2>
              <p className="mb-3 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">
                Acumulado {month ? "do mês" : "total"} — use para priorizar a reposição dos cartuchos.
                {totals.withColors < proofs.length && proofs.length > 0 && ` (${totals.withColors} de ${proofs.length} provas têm o detalhe por cor)`}
              </p>
              {totals.colorTotal <= 0 ? (
                <p className="py-6 text-center text-[13px] text-[#77767b]">Sem detalhe por cor no período.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {totals.ranked.map((c) => {
                    const v = totals.byColor[c];
                    const pct = (v / totals.colorTotal) * 100;
                    return (
                      <div key={c} className="flex items-center gap-2 text-[12px]" title={INK_INFO[c].name}>
                        <span className="w-9 flex-shrink-0 font-semibold text-[#46464a] dark:text-[#d0d0d4]">{c}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#f0f1f3] dark:bg-white/5">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(pct, v > 0 ? 1.5 : 0)}%`, backgroundColor: INK_INFO[c].swatch }} />
                        </div>
                        <span className="w-24 flex-shrink-0 text-right tabular-nums text-[#77767b] dark:text-[#a0a0a4]">{fmt(v, 2)} ml · {fmt(pct, 0)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`${card} p-5 text-[12px] text-[#46464a] dark:text-[#a0a0a4]`}>
              <h2 className="mb-2 text-[15px] font-semibold text-[#1a1c1d] dark:text-white">Como é calculado</h2>
              {settings && (
                <ul className="flex flex-col gap-1">
                  <li>Tinta: <b>{brl(settings.cartridgePrice / settings.cartridgeMl)}/ml</b> ({brl(settings.cartridgePrice)} por {fmt(settings.cartridgeMl, 0)} ml)</li>
                  <li>Papel: <b>{brl(settings.paperPricePerM2)}/m²</b></li>
                  <li>Manutenção: <b>+{fmt(settings.maintenancePct, 0)}%</b> sobre a tinta (limpeza de cabeça / bicos)</li>
                </ul>
              )}
              <p className="mt-3 font-semibold text-[#1a1c1d] dark:text-white">Faixas de referência (só conferência)</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                <li>Embalagem lisa: ~2 ml/m² → ~R$ 3 a 4 por prova</li>
                <li>Material gráfico / folder: ~4 ml/m² → ~R$ 6 a 7</li>
                <li>Arte carregada / food: 6+ ml/m² → R$ 8+</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Histórico */}
        <div className={`${card} mt-5 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(199,198,202,0.3)] px-5 py-3 dark:border-white/10">
            <h2 className="text-[15px] font-semibold text-[#1a1c1d] dark:text-white">Provas lançadas</h2>
            <div className="flex items-center gap-2">
              <button disabled={!proofs.length} onClick={() => copy([...proofs].reverse().map((p) => sheetRow(p).join("\t")).join("\n"), "all")}
                className="rounded-lg border border-[rgba(199,198,202,0.6)] px-3 py-1.5 text-[12px] font-medium text-[#46464a] hover:bg-[#f3f3f5] disabled:opacity-40 dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-white/5">
                {copied === "all" ? "Copiado ✓" : "Copiar para a planilha"}
              </button>
              <button disabled={!proofs.length} onClick={exportCsv}
                className="rounded-lg border border-[rgba(199,198,202,0.6)] px-3 py-1.5 text-[12px] font-medium text-[#46464a] hover:bg-[#f3f3f5] disabled:opacity-40 dark:border-white/10 dark:text-[#a0a0a4] dark:hover:bg-white/5">
                Exportar Excel (CSV)
              </button>
            </div>
          </div>
          {error ? (
            <p className="px-5 py-10 text-center text-[13px] text-red-600">{error}</p>
          ) : loading ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#77767b]">Carregando...</p>
          ) : proofs.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#77767b]">Nenhuma prova lançada {month ? "neste mês" : "ainda"}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[rgba(199,198,202,0.3)] text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#77767b] dark:border-white/10">
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">OS / Cliente</th>
                    <th className="px-4 py-2.5 text-right">Papel (m²)</th>
                    <th className="px-4 py-2.5 text-right">Tinta (ml)</th>
                    <th className="px-4 py-2.5 text-right">Custo total</th>
                    <th className="px-4 py-2.5 text-right">R$/m²</th>
                    <th className="px-4 py-2.5 text-right">Cobertura</th>
                    <th className="px-4 py-2.5">Cor dominante</th>
                    <th className="px-4 py-2.5">Obs</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((p) => {
                    const obs = autoNotes(p);
                    return (
                      <tr key={p.id} className={`border-b border-[rgba(199,198,202,0.2)] last:border-0 hover:bg-[#f9f9fb] dark:border-white/5 dark:hover:bg-white/[0.03] ${editing?.id === p.id ? "bg-[#005cba]/5" : ""}`}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-[#46464a] dark:text-[#a0a0a4]">{fmtDate(p.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-[#1a1c1d] dark:text-white">{p.label}</span>
                          {p.isBatch && <span className="ml-1.5 rounded bg-[#005cba]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#005cba] dark:text-[#4d9fff]">LOTE</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.paperM2, 3)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.inkMl, 3)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#1a1c1d] dark:text-white">{brl(p.totalCost)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{brl(p.costPerM2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.coverage, 2)}</td>
                        <td className="px-4 py-2.5">
                          {p.dominantColor ? <span className="inline-flex items-center gap-1.5"><Swatch color={p.dominantColor} />{dominantText(p)}</span> : <span className="text-[#a0a0a4]">—</span>}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-[#77767b]" title={obs}>
                          {p.colorsIncomplete && <span className="mr-1 text-amber-600">⚠</span>}{obs || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <button onClick={() => copy(sheetRow(p).join("\t"), p.id)} title="Copiar a linha para a planilha" className="rounded px-1.5 py-1 text-[11px] font-medium text-[#77767b] hover:bg-[#f3f3f5] hover:text-[#1a1c1d] dark:hover:bg-white/10 dark:hover:text-white">
                            {copied === p.id ? "✓" : "Copiar"}
                          </button>
                          <button onClick={() => startEdit(p)} className="rounded px-1.5 py-1 text-[11px] font-medium text-[#005cba] hover:bg-[#005cba]/10 dark:text-[#4d9fff]">Editar</button>
                          <button onClick={() => remove(p)} className="rounded px-1.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Excluir</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showSettings && settings && (
        <SettingsModal settings={settings} canEdit={isAdmin} onClose={() => setShowSettings(false)}
          onSaved={(s) => { setSettings(s); setShowSettings(false); }} />
      )}
    </div>
  );
}

// ─── Preços (admin edita; os outros só veem) ──────────────────────────────────
function SettingsModal({ settings, canEdit, onClose, onSaved }: {
  settings: ColorProofSettings; canEdit: boolean; onClose: () => void; onSaved: (s: ColorProofSettings) => void;
}) {
  const [f, setF] = useState({
    cartridgePrice: toField(settings.cartridgePrice), cartridgeMl: toField(settings.cartridgeMl),
    paperPricePerM2: toField(settings.paperPricePerM2), maintenancePct: toField(settings.maintenancePct),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const vals = { cartridgePrice: parseNum(f.cartridgePrice), cartridgeMl: parseNum(f.cartridgeMl), paperPricePerM2: parseNum(f.paperPricePerM2), maintenancePct: parseNum(f.maintenancePct) };
  const ok = vals.cartridgePrice > 0 && vals.cartridgeMl > 0 && vals.paperPricePerM2 >= 0 && vals.maintenancePct >= 0;

  async function save() {
    setSaving(true);
    setErr("");
    try { onSaved(await colorProofApi.saveSettings(vals)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  const field = (key: keyof typeof f, label: string, suffix: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-2">
        <input inputMode="decimal" disabled={!canEdit} value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} className={inputCls + " disabled:opacity-60"} />
        <span className="w-10 text-[12px] text-[#77767b]">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className={`${card} w-full max-w-md p-5 shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold text-[#1a1c1d] dark:text-white">Preços do cálculo</h2>
        <p className="mb-4 text-[12px] text-[#77767b] dark:text-[#a0a0a4]">
          Valem para as próximas provas. As já lançadas mantêm o preço da época.
          {!canEdit && " Só o administrador pode alterar."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {field("cartridgePrice", "Preço do cartucho", "R$")}
          {field("cartridgeMl", "Conteúdo do cartucho", "ml")}
          {field("paperPricePerM2", "Papel / mídia", "R$/m²")}
          {field("maintenancePct", "Manutenção", "%")}
        </div>
        {ok && <p className="mt-3 text-[12px] text-[#46464a] dark:text-[#a0a0a4]">Tinta: <b>{brl(vals.cartridgePrice / vals.cartridgeMl)}/ml</b></p>}
        <p className="mt-2 text-[11.5px] text-[#77767b]">A manutenção (+50%) é uma estimativa; os demais valores vêm da medição da máquina.</p>
        {err && <p className="mt-2 text-[12px] text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#46464a] hover:bg-[#f3f3f5] dark:text-[#a0a0a4] dark:hover:bg-white/5">{canEdit ? "Cancelar" : "Fechar"}</button>
          {canEdit && (
            <button onClick={save} disabled={!ok || saving} className="rounded-lg bg-[#005cba] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#004a96] disabled:opacity-40">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
