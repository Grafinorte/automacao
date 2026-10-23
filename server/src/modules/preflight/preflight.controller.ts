import type { Request, Response } from "express";
import fs from "fs";
import { analyzePdf } from "./preflight.service";
import { PREFLIGHT_CONFIG } from "./preflight.config";
import { prisma } from "../../db/prisma";

const MAX_HISTORY = 50;

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export async function postAnalyze(req: MulterRequest, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "Nenhum arquivo PDF enviado." });
    return;
  }

  const originalName = file.originalname ?? "";
  if (!originalName.toLowerCase().endsWith(".pdf")) {
    cleanupFile(file);
    res.status(400).json({ error: "Apenas arquivos PDF são aceitos." });
    return;
  }

  if (file.mimetype && !["application/pdf", "application/x-pdf"].includes(file.mimetype)) {
    cleanupFile(file);
    res.status(400).json({ error: "Tipo MIME inválido. Apenas application/pdf é aceito." });
    return;
  }

  let pdfBytes: Buffer;
  try {
    if (file.buffer) {
      pdfBytes = file.buffer;
    } else if (file.path) {
      pdfBytes = fs.readFileSync(file.path);
    } else {
      res.status(500).json({ error: "Erro interno: arquivo não encontrado." });
      return;
    }
  } catch {
    cleanupFile(file);
    res.status(500).json({ error: "Erro ao ler o arquivo enviado." });
    return;
  }

  const header = pdfBytes.slice(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    cleanupFile(file);
    res.status(400).json({ error: "O arquivo não é um PDF válido (cabeçalho %PDF não encontrado)." });
    return;
  }

  if (pdfBytes.length > PREFLIGHT_CONFIG.maxPdfSizeMb * 1024 * 1024) {
    cleanupFile(file);
    res.status(400).json({ error: `Arquivo muito grande. Tamanho máximo: ${PREFLIGHT_CONFIG.maxPdfSizeMb}MB.` });
    return;
  }

  try {
    const result = await analyzePdf(pdfBytes, originalName);
    cleanupFile(file);

    // Save to history (fire-and-forget, don't fail the request on DB error)
    const userId = req.user?.sub;
    if (userId) {
      prisma.preflightHistory.create({
        data: {
          userId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          pageCount: result.summary.pageCount,
          status: result.summary.overallStatus,
          errorCount: result.summary.errorCount,
          warnCount: result.summary.warningCount,
          resultJson: JSON.stringify(result),
        },
      })
      .then(() => {
        // Prune old entries — keep only the last MAX_HISTORY globally
        return prisma.preflightHistory.findMany({
          orderBy: { analyzedAt: "desc" },
          select: { id: true },
          skip: MAX_HISTORY,
        });
      })
      .then((old) => {
        if (old.length > 0) {
          return prisma.preflightHistory.deleteMany({
            where: { id: { in: old.map((r) => r.id) } },
          });
        }
      })
      .catch((e) => console.error("[Preflight] Failed to save history:", e));
    }

    res.json(result);
  } catch (err) {
    cleanupFile(file);
    const message = err instanceof Error ? err.message : "Erro desconhecido durante a análise.";
    res.status(422).json({ error: message });
  }
}

export async function getHistory(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.preflightHistory.findMany({
    orderBy: { analyzedAt: "desc" },
    take: MAX_HISTORY,
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      pageCount: true,
      status: true,
      errorCount: true,
      warnCount: true,
      analyzedAt: true,
      resultJson: true,
      user: { select: { id: true, name: true } },
    },
  });
  res.json(rows);
}

export async function deleteHistoryEntry(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await prisma.preflightHistory.deleteMany({ where: { id } });
  res.json({ ok: true });
}

export async function clearHistory(_req: Request, res: Response): Promise<void> {
  await prisma.preflightHistory.deleteMany({});
  res.json({ ok: true });
}

function cleanupFile(file: Express.Multer.File | undefined): void {
  if (!file) return;
  if (file.path) {
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
  }
}
