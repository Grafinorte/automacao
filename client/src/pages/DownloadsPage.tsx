import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { downloadsApi, type DownloadFile } from "../api/downloads";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXT_META: Record<string, { label: string; from: string; to: string }> = {
  ".pdf":  { label: "PDF",  from: "#ef4444", to: "#f97316" },
  ".docx": { label: "DOC",  from: "#2563eb", to: "#7c3aed" },
  ".doc":  { label: "DOC",  from: "#2563eb", to: "#7c3aed" },
  ".xlsx": { label: "XLS",  from: "#16a34a", to: "#0891b2" },
  ".xls":  { label: "XLS",  from: "#16a34a", to: "#0891b2" },
  ".pptx": { label: "PPT",  from: "#f97316", to: "#db2777" },
  ".ppt":  { label: "PPT",  from: "#f97316", to: "#db2777" },
  ".zip":  { label: "ZIP",  from: "#854d0e", to: "#b45309" },
  ".csv":  { label: "CSV",  from: "#059669", to: "#0891b2" },
  ".txt":  { label: "TXT",  from: "#475569", to: "#64748b" },
  ".png":  { label: "IMG",  from: "#db2777", to: "#7c3aed" },
  ".jpg":  { label: "IMG",  from: "#db2777", to: "#7c3aed" },
  ".jpeg": { label: "IMG",  from: "#db2777", to: "#7c3aed" },
};

function GradientFallback({ ext }: { ext: string }) {
  const meta = EXT_META[ext] ?? { label: "ARQ", from: "#6366f1", to: "#8b5cf6" };
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2"
      style={{ background: `linear-gradient(145deg, ${meta.from}, ${meta.to})` }}
    >
      <span className="text-[28px] font-black tracking-tight text-white/90">{meta.label}</span>
    </div>
  );
}

function PdfThumbnail({ url, onError }: { url: string; onError: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container) return;

      try {
        const pdf = await getDocument({ url, withCredentials: true }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const vp0 = page.getViewport({ scale: 1 });
        const scale = (container.clientWidth || 200) / vp0.width;
        const vp = page.getViewport({ scale });

        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);

        const ctx = canvas.getContext("2d");
        if (!ctx || cancelled) return;

        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) { setStatus("error"); onError(); }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [url, onError]);

  if (status === "error") return null;

  return (
    <>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f4f4f6] dark:bg-[#111214]">
          <svg className="h-5 w-5 animate-spin text-[#77767b]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: status === "done" ? "block" : "none",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "auto",
        }}
      />
    </>
  );
}

function CoverArea({ file }: { file: DownloadFile }) {
  const [imgError, setImgError] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  if (file.coverFile && !imgError) {
    return (
      <img
        src={downloadsApi.fileUrl(file.coverFile)}
        alt={file.name}
        onError={() => setImgError(true)}
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }

  if (file.ext === ".pdf" && !pdfError) {
    return (
      <PdfThumbnail
        url={downloadsApi.fileUrl(file.name)}
        onError={() => setPdfError(true)}
      />
    );
  }

  return <GradientFallback ext={file.ext} />;
}

function DownloadCard({ file }: { file: DownloadFile }) {
  const displayName = file.name.replace(/\.[^.]+$/, "");

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-[rgba(199,198,202,0.35)] bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:bg-[#1c1e22] dark:border-white/8 dark:hover:shadow-black/40">
      {/* Cover */}
      <div className="relative h-52 w-full overflow-hidden bg-[#f4f4f6] dark:bg-[#111214]">
        <CoverArea file={file} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
        <span className="absolute right-2.5 top-2.5 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          {file.ext.replace(".", "")}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#1a1c1d] dark:text-[#e0e0e2]" title={displayName}>
            {displayName}
          </p>
          <p className="mt-1 text-[11px] text-[#77767b]">{formatBytes(file.sizeBytes)}</p>
        </div>

        <a
          href={downloadsApi.fileUrl(file.name)}
          download={file.name}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #1a56db 0%, #7c3aed 100%)" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Baixar
        </a>
      </div>
    </div>
  );
}

export function DownloadsPage() {
  const [files, setFiles] = useState<DownloadFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    downloadsApi.listFiles()
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[#030304] dark:text-[#e0e0e2]">
          Downloads
        </h1>
        <p className="mt-1 text-[15px] text-[#46464a] dark:text-[#a0a0a4]">
          Catálogos, modelos, papéis timbrados e materiais da empresa
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-[14px] text-[#77767b]">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Carregando arquivos…
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, #1a56db 0%, #7c3aed 100%)" }}
          >
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#1a1c1d] dark:text-[#e0e0e2]">Nenhum arquivo ainda</p>
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[#77767b]">
            Adicione arquivos na pasta <span className="font-medium text-[#46464a] dark:text-[#c0c0c4]">downloads/</span> na raiz do projeto.
            PDFs mostram a primeira página automaticamente como capa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {files.map((file) => (
            <DownloadCard key={file.name} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}
