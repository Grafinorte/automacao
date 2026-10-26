// Logo da empresa do cliente como foto do contato do WhatsApp.
// A API oficial do WhatsApp não entrega a foto de perfil, então usamos o site da empresa:
// 1) site digitado no contato  2) domínio do e-mail do contato no CRM  3) site do lead da prospecção.
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { prisma } from "../../db/prisma";

export const AVATAR_DIR = path.join(__dirname, "../../../data/wa-avatars");

const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// E-mails pessoais não dizem qual é a empresa
const FREE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br",
  "globo.com", "globomail.com", "protonmail.com", "proton.me", "zipmail.com.br", "r7.com",
]);
// Sites que não são da empresa (redes sociais, encurtadores) — a logo seria a da rede social
const NOT_COMPANY_SITE = /(^|\.)(instagram|facebook|fb|wa|whatsapp|linktr|linkedin|tiktok|youtube|google|goo|bit|twitter|x)\.(com|me|ee|gl|ly)(\.br)?$/;

/** "https://www.Empresa.com.br/contato" → "empresa.com.br" (null se não parecer um domínio) */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const host = input.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").replace(/^www\./, "")
    .split(/[/?#:\s]/)[0];
  // Precisa ser um nome de site (endereço IP ou "localhost" não buscam logo)
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) || NOT_COMPANY_SITE.test(host)) return null;
  return host;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** DDD + 8 últimos dígitos: o mesmo celular com ou sem o nono dígito e com ou sem o 55 */
const phoneKey = (s: string | null | undefined) => {
  const d = digits(s).replace(/^55(?=\d{10,11}$)/, "");
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
};

async function companyDomainFor(contact: { phone: string; website: string | null; crmContactId: string | null }): Promise<string | null> {
  const typed = normalizeDomain(contact.website);
  if (typed) return typed;

  // Contato do CRM: o ligado ao WhatsApp ou, se não houver, o que tem o mesmo celular
  let crm = contact.crmContactId
    ? await prisma.contact.findUnique({ where: { id: contact.crmContactId }, select: { id: true, email: true } })
    : null;
  if (!crm) {
    const key = phoneKey(contact.phone);
    if (key) {
      const candidates = await prisma.contact.findMany({ where: { phone: { not: null } }, select: { id: true, email: true, phone: true } });
      crm = candidates.find((c) => phoneKey(c.phone) === key) ?? null;
    }
  }
  if (!crm) return null;

  const emailDomain = crm.email?.split("@")[1]?.trim().toLowerCase();
  if (emailDomain && !FREE_EMAIL.has(emailDomain)) {
    const d = normalizeDomain(emailDomain);
    if (d) return d;
  }
  const lead = await prisma.prospectLead.findFirst({
    where: { contactId: crm.id, website: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { website: true },
  });
  return normalizeDomain(lead?.website);
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "*/*" } });
  } finally {
    clearTimeout(timer);
  }
}

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
};

/** Baixa a imagem se for um formato seguro (sem SVG, que pode conter script) e de tamanho razoável */
async function downloadImage(url: string): Promise<{ buf: Buffer; ext: string } | null> {
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_EXT[type];
    if (!ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > 2_000_000) return null;
    return { buf, ext };
  } catch {
    return null;
  }
}

/** Largura × altura lidas do cabeçalho da imagem (PNG, JPEG, GIF, WebP, ICO) — sem bibliotecas */
export function imageSize(buf: Buffer, ext: string): { w: number; h: number } | null {
  try {
    if (ext === "png" && buf.readUInt32BE(12) === 0x49484452) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (ext === "gif") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (ext === "ico") {
      let best = { w: 0, h: 0 };
      for (let i = 0, n = buf.readUInt16LE(4); i < n && 6 + i * 16 + 2 <= buf.length; i++) {
        const w = buf[6 + i * 16] || 256, h = buf[7 + i * 16] || 256;
        if (w > best.w) best = { w, h };
      }
      return best.w ? best : null;
    }
    if (ext === "webp") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
      if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (ext === "jpg") {
      for (let i = 2; i + 9 < buf.length;) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* cabeçalho incompleto */ }
  return null;
}

/** Endereços de ícones que o próprio site declara: manifest (192/512 px), apple-touch-icon e ícones comuns */
async function siteIconUrls(domain: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`https://${domain}/`, 8000);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return [];
    const html = (await res.text()).slice(0, 600_000);
    const found: { href: string; score: number }[] = [];
    const add = (href: string, base: string, score: number) => {
      if (/\.svg(\?|$)/i.test(href)) return;
      try { found.push({ href: new URL(href.replace(/&amp;/g, "&"), base).toString(), score }); } catch { /* href inválido */ }
    };
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
      const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
      if (!href) continue;
      if (rel.includes("manifest")) {
        // Manifest do site: costuma ter os ícones maiores
        try {
          const mUrl = new URL(href.replace(/&amp;/g, "&"), res.url).toString();
          const m = await fetchWithTimeout(mUrl, 6000);
          const icons = m.ok ? ((await m.json()) as { icons?: { src?: string; sizes?: string }[] }).icons ?? [] : [];
          for (const ic of icons) if (ic.src) add(ic.src, mUrl, Number(/(\d+)x/.exec(ic.sizes ?? "")?.[1] ?? 100));
        } catch { /* manifest inválido */ }
      } else if (/icon/.test(rel) && !rel.includes("mask-icon")) {
        const size = Number(/\bsizes\s*=\s*["']?(\d+)x\d+/i.exec(tag)?.[1] ?? 0);
        add(href, res.url, size || (rel.includes("apple") ? 180 : 32));
      }
    }
    return found.sort((a, b) => b.score - a.score).map((f) => f.href);
  } catch {
    return [];
  }
}

/** Baixa as opções e fica com a maior imagem quase quadrada (logos muito largas viram um risco no círculo) */
async function fetchLogo(domain: string) {
  const d = encodeURIComponent(domain);
  const urls = [
    ...(await siteIconUrls(domain)).slice(0, 4),
    `https://${domain}/apple-touch-icon.png`,
    // Ícone guardado pelo Google e pelo DuckDuckGo (funcionam mesmo quando o site bloqueia robôs)
    `https://www.google.com/s2/favicons?domain=${d}&sz=256`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
  ];
  let best: { buf: Buffer; ext: string; score: number } | null = null;
  for (const url of [...new Set(urls)]) {
    const img = await downloadImage(url);
    const size = img && imageSize(img.buf, img.ext);
    if (!img || !size || size.w < 16 || size.h < 16) continue;
    const ratio = Math.max(size.w, size.h) / Math.min(size.w, size.h);
    const score = Math.min(size.w, size.h) * (ratio > 1.5 ? 0.3 : 1);
    if (!best || score > best.score) best = { ...img, score };
    if (score >= 180) break; // já é grande o bastante
  }
  return best;
}

/**
 * Descobre o domínio da empresa do contato e salva a logo. `force` refaz mesmo se já verificado.
 * Retorna o contato atualizado.
 */
export async function refreshContactLogo(contactId: string, force = false) {
  const contact = await prisma.waContact.findUnique({ where: { id: contactId } });
  if (!contact) return null;
  const domain = await companyDomainFor(contact);
  const fresh = contact.avatarCheckedAt && Date.now() - contact.avatarCheckedAt.getTime() < RECHECK_MS;
  if (!force && fresh && domain === contact.avatarDomain) return contact;

  let avatarFile: string | null = null;
  if (domain) {
    const img = await fetchLogo(domain);
    if (img) {
      await fs.promises.mkdir(AVATAR_DIR, { recursive: true });
      // Nome muda a cada logo nova, para o navegador não mostrar a antiga do cache
      avatarFile = `${contact.id}-${crypto.createHash("sha1").update(img.buf).digest("hex").slice(0, 10)}.${img.ext}`;
      await fs.promises.writeFile(path.join(AVATAR_DIR, avatarFile), img.buf);
    }
  }
  if (contact.avatarFile && contact.avatarFile !== avatarFile) {
    await fs.promises.unlink(path.join(AVATAR_DIR, contact.avatarFile)).catch(() => {});
  }
  return prisma.waContact.update({
    where: { id: contact.id },
    data: { avatarFile, avatarDomain: domain, avatarCheckedAt: new Date() },
  });
}

// Busca em segundo plano as logos de quem ainda não foi verificado (um por vez, poucos por rodada)
let backgroundRunning = false;
export function refreshMissingLogosInBackground() {
  if (backgroundRunning) return;
  backgroundRunning = true;
  (async () => {
    const pending = await prisma.waContact.findMany({
      where: { OR: [{ avatarCheckedAt: null }, { avatarCheckedAt: { lt: new Date(Date.now() - RECHECK_MS) } }] },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    });
    for (const { id } of pending) {
      await refreshContactLogo(id).catch((err) => console.error("[WA Logo] Erro ao buscar logo:", err));
    }
  })()
    .catch((err) => console.error("[WA Logo]", err))
    .finally(() => { backgroundRunning = false; });
}
