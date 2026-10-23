import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  adminName: process.env.ADMIN_NAME || "Administrador",
  adminEmail: process.env.ADMIN_EMAIL || "admin@grafinorte.com.br",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "grafinorte_wh_2025",
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
  metaAppId: process.env.META_APP_ID || "",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  metaInstagramAccounts: [
    {
      id: process.env.META_INSTAGRAM_ID_GRAFINORTE || "",
      token: process.env.META_INSTAGRAM_TOKEN_GRAFINORTE || "",
      name: "grafinorte",
    },
    {
      id: process.env.META_INSTAGRAM_ID_PLUSPACK || "",
      token: process.env.META_INSTAGRAM_TOKEN_PLUSPACK || "",
      name: "pluspackbr",
    },
  ].filter(a => a.id && a.token),
  // Google Analytics 4 (somente leitura) — conta de serviço do Google Cloud com acesso de Leitor nas propriedades
  gaServiceAccountFile: process.env.GA_SERVICE_ACCOUNT_FILE || "",
  gaServiceAccountJson: process.env.GA_SERVICE_ACCOUNT_JSON || "",
  gaSites: parseGaSites(),
  // treg (treg.to) — busca de empresas no Google Maps para a Prospecção
  tregToken: process.env.TREG_TOKEN || "",
  tregBaseUrl: process.env.TREG_BASE_URL || "https://treg.to",
  // Limite de buscas por usuário por dia (proteção do saldo)
  tregDailyLimitPerUser: Number(process.env.TREG_DAILY_LIMIT_PER_USER) || 50,
};

export interface GaSiteConfig {
  key: string;
  label: string;
  /** Empresa, para agrupar na tela (Grafinorte, Pluspack) */
  group: string;
  propertyId: string;
  /** Opcional: quando várias LPs dividem a mesma propriedade, filtra pelo domínio */
  hostname?: string;
  /** Visão somada: chaves dos sites que compõem este item (ex.: "Todas as LPs") */
  combine?: string[];
}

/**
 * GA_SITES (JSON) permite vários sites/LPs; sem ele, usa GA_PROPERTY_GRAFINORTE e GA_PROPERTY_PLUSPACK.
 * Ex.: [{"key":"site","label":"Site","group":"Grafinorte","propertyId":"123"},
 *       {"key":"lp-cartao","label":"LP Cartão de visita","group":"Grafinorte","propertyId":"456"}]
 */
function parseGaSites(): GaSiteConfig[] {
  const raw = process.env.GA_SITES;
  if (raw) {
    try {
      const list = JSON.parse(raw) as Partial<GaSiteConfig>[];
      return list
        .filter((s) => s.key && s.label && (s.propertyId || s.combine?.length))
        .map((s) => ({
          key: s.key!, label: s.label!, group: s.group || "Outros", propertyId: String(s.propertyId ?? ""),
          hostname: s.hostname || undefined, combine: s.combine?.length ? s.combine : undefined,
        }));
    } catch {
      console.error("[GA] GA_SITES inválido (precisa ser JSON) — usando GA_PROPERTY_*");
    }
  }
  return [
    { key: "grafinorte", label: "Grafinorte", group: "Grafinorte", propertyId: process.env.GA_PROPERTY_GRAFINORTE || "" },
    { key: "pluspack", label: "Pluspack", group: "Pluspack", propertyId: process.env.GA_PROPERTY_PLUSPACK || "" },
  ];
}
