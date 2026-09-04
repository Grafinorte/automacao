import type { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { v2 as cloudinary } from "cloudinary";
import * as metaService from "./meta.service";
import { env } from "../../config/env";

const SOCIAL_DIR = path.join(__dirname, "../../../data/social-media");
fs.mkdirSync(SOCIAL_DIR, { recursive: true });

const cloudinaryEnabled = !!(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
  });
  console.log("  [Cloudinary] CDN configurado — uploads irão para Cloudinary.");
} else {
  console.log("  [Cloudinary] Não configurado — uploads salvos localmente (Instagram não consegue acessar localhost).");
}

export async function getAccounts(_req: Request, res: Response) {
  res.json(metaService.getAccounts().map(a => ({ name: a.name, id: a.id })));
}

export async function getSummary(_req: Request, res: Response) {
  res.json(await metaService.getAllAccountsSummary());
}

export async function getProfile(req: Request, res: Response) {
  const account = metaService.getAccount(req.params.account);
  if (!account) { res.status(404).json({ error: "Conta não encontrada" }); return; }
  res.json(await metaService.getProfile(account));
}

export async function getPosts(req: Request, res: Response) {
  const account = metaService.getAccount(req.params.account);
  if (!account) { res.status(404).json({ error: "Conta não encontrada" }); return; }
  res.json(await metaService.getPosts(account, Number(req.query.limit) || 20));
}

export async function getInsights(req: Request, res: Response) {
  const account = metaService.getAccount(req.params.account);
  if (!account) { res.status(404).json({ error: "Conta não encontrada" }); return; }
  res.json(await metaService.getAccountInsights(account, Number(req.query.days) || 30));
}

export async function getPostInsights(req: Request, res: Response) {
  const account = metaService.getAccount(req.params.account);
  if (!account) { res.status(404).json({ error: "Conta não encontrada" }); return; }
  res.json(await metaService.getPostInsights(account, req.params.mediaId));
}

export async function uploadMedia(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) { res.status(400).json({ error: "Arquivo obrigatório" }); return; }

  if (cloudinaryEnabled) {
    // Upload to Cloudinary — returns a public URL accessible by Instagram
    const isVideo = file.mimetype.startsWith("video/");
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: isVideo ? "video" : "image", folder: "grafinorte-social" },
        (err, result) => { if (err || !result) reject(err ?? new Error("Cloudinary falhou")); else resolve(result); }
      );
      stream.end(file.buffer);
    });
    res.json({ url: result.secure_url });
    return;
  }

  // Fallback: save locally (only works when server is publicly accessible)
  const ext = path.extname(file.originalname) || `.${file.mimetype.split("/")[1]}`;
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  fs.writeFileSync(path.join(SOCIAL_DIR, filename), file.buffer);
  const host = `${req.protocol}://${req.get("host")}`;
  res.json({ url: `${host}/social-media/${filename}`, filename });
}

export async function publishNow(req: Request, res: Response) {
  const account = metaService.getAccount(req.params.account);
  if (!account) { res.status(404).json({ error: "Conta não encontrada" }); return; }
  const { mediaUrl, caption, mediaType, coverUrl } = req.body as {
    mediaUrl?: string; caption?: string; mediaType?: string; coverUrl?: string;
  };
  if (!mediaUrl) { res.status(400).json({ error: "mediaUrl é obrigatório" }); return; }
  let result: { id: string };
  if (mediaType === "REELS") {
    result = await metaService.publishReel(account, mediaUrl, caption ?? "", coverUrl, true);
  } else if (mediaType === "STORIES") {
    const isVideo = /\.(mp4|mov|avi|webm)$/i.test(mediaUrl);
    result = await metaService.publishStory(account, mediaUrl, isVideo, true);
  } else {
    result = await metaService.publishPhoto(account, mediaUrl, caption ?? "", true);
  }
  res.json(result);
}

export async function schedulePost(req: Request, res: Response) {
  const { account, mediaUrl, caption, mediaType, coverUrl, scheduledAt } = req.body as {
    account?: string; mediaUrl?: string; caption?: string;
    mediaType?: string; coverUrl?: string; scheduledAt?: string;
  };
  if (!account || !mediaUrl || !scheduledAt) {
    res.status(400).json({ error: "account, mediaUrl e scheduledAt são obrigatórios" }); return;
  }
  const post = await metaService.createScheduledPost({
    account,
    mediaUrl,
    caption: caption ?? "",
    mediaType: mediaType ?? "IMAGE",
    coverUrl,
    scheduledAt: new Date(scheduledAt),
    createdById: req.user!.sub,
  });
  res.status(201).json(post);
}

export async function getScheduledPosts(_req: Request, res: Response) {
  res.json(await metaService.listScheduledPosts());
}

export async function deleteScheduledPost(req: Request, res: Response) {
  await metaService.deleteScheduledPost(req.params.id);
  res.json({ ok: true });
}
