import { Router } from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const downloadsRouter = Router();
downloadsRouter.use(requireAuth);

const DOWNLOADS_DIR = path.join(__dirname, "../../../../downloads");
const IMAGE_EXTS  = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const DOC_EXTS    = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".zip", ".csv", ".txt"]);

function ensureDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function findCover(baseName: string, allNames: Set<string>): string | undefined {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const candidate = baseName + ext;
    if (allNames.has(candidate)) return candidate;
  }
  return undefined;
}

downloadsRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    ensureDir();
    const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true }).filter((e) => e.isFile());
    const allNames = new Set(entries.map((e) => e.name));

    // discover which images are covers (same base name as a doc)
    const coverImages = new Set<string>();
    for (const e of entries) {
      const ext = path.extname(e.name).toLowerCase();
      if (DOC_EXTS.has(ext)) {
        const cover = findCover(path.basename(e.name, ext), allNames);
        if (cover) coverImages.add(cover);
      }
    }

    const files = entries
      .filter((e) => {
        const ext = path.extname(e.name).toLowerCase();
        if (IMAGE_EXTS.has(ext)) return !coverImages.has(e.name); // orphan images only
        return DOC_EXTS.has(ext);
      })
      .map((e) => {
        const ext  = path.extname(e.name).toLowerCase();
        const base = path.basename(e.name, ext);
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, e.name));
        const coverFile = IMAGE_EXTS.has(ext) ? e.name : findCover(base, allNames);
        return { name: e.name, ext, sizeBytes: stat.size, coverFile: coverFile ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    res.json(files);
  })
);

downloadsRouter.get(
  "/file/:filename",
  asyncHandler(async (req: Request, res: Response) => {
    ensureDir();
    const safe = path.basename(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, safe);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Arquivo não encontrado." }); return; }
    res.download(filePath, safe);
  })
);
