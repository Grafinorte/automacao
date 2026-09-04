import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const downloadsRouter = Router();
downloadsRouter.use(requireAuth);

const DOWNLOADS_DIR = path.join(__dirname, "../../../../downloads");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const DOC_EXTS   = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".zip", ".csv", ".txt", ".ai"]);
const ALL_EXTS   = new Set([...IMAGE_EXTS, ...DOC_EXTS]);

function ensureDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function findCover(baseName: string, allNames: Set<string>): string | undefined {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    if (allNames.has(baseName + ext)) return baseName + ext;
  }
  return undefined;
}

interface DownloadEntry {
  name: string;
  ext: string;
  sizeBytes: number;
  coverFile: string | null;
  group: string | null;   // null = raiz; "logo marcas/grafinorte" = subpasta
  relativePath: string;   // caminho relativo a DOWNLOADS_DIR para servir
}

function scanDir(dir: string, groupName: string | null, depth: number): DownloadEntry[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  // Se ainda há profundidade, entrar em subpastas
  if (depth > 0) {
    const subResults: DownloadEntry[] = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        const subGroup = groupName ? `${groupName}/${e.name}` : e.name;
        subResults.push(...scanDir(path.join(dir, e.name), subGroup, depth - 1));
      }
    }
    if (subResults.length > 0) {
      // há subpastas com conteúdo — retornar só subpastas (não misturar com arquivos da pasta pai)
      // mas ainda incluir arquivos soltos na pasta pai como grupo próprio
    }
  }

  const files = entries.filter((e) => e.isFile());
  const allNames = new Set(files.map((e) => e.name));

  // Descobrir quais imagens são capas de documentos
  const coverImages = new Set<string>();
  for (const e of files) {
    const ext = path.extname(e.name).toLowerCase();
    if (DOC_EXTS.has(ext)) {
      const cover = findCover(path.basename(e.name, ext), allNames);
      if (cover) coverImages.add(cover);
    }
  }

  const result: DownloadEntry[] = files
    .filter((e) => {
      const ext = path.extname(e.name).toLowerCase();
      if (!ALL_EXTS.has(ext)) return false;
      if (IMAGE_EXTS.has(ext)) return !coverImages.has(e.name); // imagens que não são capa
      return true;
    })
    .map((e) => {
      const ext  = path.extname(e.name).toLowerCase();
      const base = path.basename(e.name, ext);
      const stat = fs.statSync(path.join(dir, e.name));
      const coverFile = IMAGE_EXTS.has(ext) ? e.name : findCover(base, allNames) ?? null;
      const relDir = groupName ? groupName.replace(/\//g, path.sep) : "";
      const relativePath = relDir ? `${relDir}${path.sep}${e.name}` : e.name;
      return { name: e.name, ext, sizeBytes: stat.size, coverFile, group: groupName, relativePath };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  // Subpastas
  const subEntries: DownloadEntry[] = [];
  if (depth > 0) {
    for (const e of entries) {
      if (e.isDirectory()) {
        const subGroup = groupName ? `${groupName}/${e.name}` : e.name;
        subEntries.push(...scanDir(path.join(dir, e.name), subGroup, depth - 1));
      }
    }
  }

  return [...result, ...subEntries];
}

downloadsRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    ensureDir();
    res.json(scanDir(DOWNLOADS_DIR, null, 3));
  })
);

downloadsRouter.get(
  "/file/*",
  asyncHandler(async (req: Request, res: Response) => {
    ensureDir();
    // Express captures the wildcard as req.params[0]
    const rawPath = (req.params as Record<string, string>)[0] ?? "";
    // Normalize and prevent path traversal
    const safePath = rawPath.split("/").map((s: string) => path.basename(s)).join(path.sep);
    const filePath = path.join(DOWNLOADS_DIR, safePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).json({ error: "Arquivo não encontrado." });
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    if (ext === ".svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(safePath)}"`);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.download(filePath, path.basename(safePath));
    }
  })
);
