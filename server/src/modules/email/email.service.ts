import nodemailer from "nodemailer";
import { HttpError } from "../../middleware/errorHandler";

export interface EmailQuoteItem {
  productName: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
}

export interface EmailQuoteData {
  number: number;
  clientName: string;
  clientContact: string | null;
  validUntil: Date | null;
  notes: string | null;
  createdAt: Date;
  createdBy: { name: string };
  items: EmailQuoteItem[];
  issuingCompany: string;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

function buildHtml(quote: EmailQuoteData): string {
  const grandTotal = quote.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const itemRows = quote.items
    .map(
      (item, idx) => `
    <tr style="border-bottom:1px solid #eeeeee;">
      <td style="padding:10px 12px;color:#888888;font-size:11px;vertical-align:top;width:28px;">${String(idx + 1).padStart(2, "0")}</td>
      <td style="padding:10px 8px;vertical-align:top;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#111111;">${item.productName}</p>
        <p style="margin:3px 0 0;font-size:11px;color:#666666;line-height:1.5;">${item.specifications}</p>
      </td>
      <td style="padding:10px 8px;font-size:12px;color:#444444;white-space:nowrap;vertical-align:top;text-align:right;">${fmt(item.unitPrice)}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#111111;white-space:nowrap;vertical-align:top;text-align:right;">${fmt(item.quantity * item.unitPrice)}</td>
    </tr>`
    )
    .join("");

  const validLine = quote.validUntil
    ? `<p style="margin:4px 0 0;font-size:10px;color:#888888;">Validade: ${fmtDate(quote.validUntil)}</p>`
    : "";

  const notesBlock = quote.notes
    ? `<tr><td colspan="2" style="padding:16px 0 0;">
        <p style="margin:0 0 6px;font-size:9px;font-weight:700;letter-spacing:2px;color:#aaaaaa;text-transform:uppercase;">OBSERVAÇÕES</p>
        <p style="margin:0;font-size:11px;color:#555555;line-height:1.6;">${quote.notes}</p>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Proposta Comercial Grafinorte #${quote.number}</title></head>
<body style="margin:0;padding:0;background:#f0f0f2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- CAPA ESCURA -->
  <tr><td style="background:#111111;border-radius:12px 12px 0 0;padding:40px 44px 36px;">
    <table width="100%"><tr>
      <td><span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:3px;">GRAFINORTE</span><sup style="color:#e53935;font-size:9px;">®</sup><br>
          <span style="color:#555555;font-size:8px;letter-spacing:3px;text-transform:uppercase;">Indústria Gráfica</span></td>
      <td align="right" style="vertical-align:top;">
        <span style="color:#666666;font-size:8px;letter-spacing:2px;">APUCARANA · PR</span><br>
        <span style="color:#666666;font-size:8px;letter-spacing:2px;">GRUPO TRIBUNA</span>
      </td>
    </tr></table>

    <div style="border-top:1px solid #2a2a2a;margin:28px 0;"></div>

    <p style="margin:0 0 8px;color:#888888;font-size:8px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">PROPOSTA COMERCIAL</p>
    <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;line-height:1.15;">Impressão que valoriza cada</p>
    <p style="margin:4px 0 0;color:#e53935;font-size:28px;font-style:italic;font-weight:400;">detalhe.</p>

    <div style="border-top:1px solid #2a2a2a;margin:28px 0;"></div>

    <table width="100%"><tr>
      <td style="vertical-align:bottom;">
        <p style="margin:0 0 5px;color:#888888;font-size:8px;letter-spacing:2px;text-transform:uppercase;">PREPARADO PARA</p>
        <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${quote.clientName}</p>
      </td>
      <td align="right" style="vertical-align:bottom;">
        <p style="margin:0 0 3px;color:#888888;font-size:8px;letter-spacing:2px;text-transform:uppercase;">ORÇAMENTO Nº</p>
        <p style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">${quote.number}</p>
        <p style="margin:4px 0 0;color:#888888;font-size:10px;">Apucarana, ${fmtDate(quote.createdAt)}</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- CORPO BRANCO -->
  <tr><td style="background:#ffffff;padding:36px 44px;">

    <!-- Header -->
    <table width="100%" style="margin-bottom:16px;"><tr>
      <td><span style="font-size:15px;font-weight:700;color:#111111;letter-spacing:1px;">GRAFINORTE</span></td>
      <td align="right"><span style="font-size:10px;color:#aaaaaa;letter-spacing:2px;">ORÇAMENTO Nº ${quote.number}</span></td>
    </tr></table>
    <div style="border-top:2px solid #111111;margin-bottom:20px;"></div>

    <p style="margin:0 0 4px;color:#aaaaaa;font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">PROPOSTA DE PRODUÇÃO</p>
    <p style="margin:0 0 20px;color:#111111;font-size:20px;font-weight:700;">Produto / Serviço</p>

    <!-- Cliente info -->
    <table width="100%" style="border:1px solid #e5e5e5;border-radius:6px;margin-bottom:24px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;border-right:1px solid #e5e5e5;width:33%;">
          <p style="margin:0 0 4px;color:#aaaaaa;font-size:8px;letter-spacing:2px;text-transform:uppercase;">CLIENTE</p>
          <p style="margin:0;color:#111111;font-size:13px;font-weight:700;">${quote.clientName}</p>
        </td>
        <td style="padding:12px 16px;border-right:1px solid #e5e5e5;width:33%;">
          <p style="margin:0 0 4px;color:#aaaaaa;font-size:8px;letter-spacing:2px;text-transform:uppercase;">CONTATO</p>
          <p style="margin:0;color:#111111;font-size:13px;font-weight:700;">${quote.clientContact ?? "—"}</p>
        </td>
        <td style="padding:12px 16px;width:33%;">
          <p style="margin:0 0 4px;color:#aaaaaa;font-size:8px;letter-spacing:2px;text-transform:uppercase;">DATA · CIDADE</p>
          <p style="margin:0;color:#111111;font-size:13px;font-weight:700;">${fmtDate(quote.createdAt)} · Apucarana</p>
        </td>
      </tr>
    </table>

    <!-- Itens -->
    <table width="100%" style="border-collapse:collapse;margin-bottom:20px;">
      <tr style="background:#111111;">
        <td style="padding:8px 12px;color:#ffffff;font-size:9px;font-weight:700;letter-spacing:1px;" colspan="2">PRODUTO / ESPECIFICAÇÃO</td>
        <td style="padding:8px 8px;color:#ffffff;font-size:9px;font-weight:700;letter-spacing:1px;text-align:right;">UNIT.</td>
        <td style="padding:8px 12px;color:#ffffff;font-size:9px;font-weight:700;letter-spacing:1px;text-align:right;">TOTAL</td>
      </tr>
      ${itemRows}
    </table>

    <!-- Total -->
    <table width="100%" style="margin-bottom:28px;">
      <tr>
        <td align="right">
          <span style="font-size:16px;font-weight:700;color:#111111;">Total geral: ${fmt(grandTotal)}</span>
          ${validLine}
        </td>
      </tr>
    </table>

    <!-- Condições e observações -->
    <table width="100%" style="margin-bottom:24px;">
      ${notesBlock}
    </table>

    <!-- Rodapé interno -->
    <div style="border-top:1px solid #e5e5e5;padding-top:16px;">
      <table width="100%"><tr>
        <td>
          <p style="margin:0 0 3px;color:#aaaaaa;font-size:8px;letter-spacing:2px;text-transform:uppercase;">VENDEDOR</p>
          <p style="margin:0;color:#111111;font-size:13px;font-weight:700;">${quote.createdBy.name}</p>
        </td>
        <td align="right" style="vertical-align:bottom;">
          <p style="margin:0;color:#aaaaaa;font-size:9px;">Grafinorte Indústria Gráfica LTDA</p>
          <p style="margin:2px 0 0;color:#aaaaaa;font-size:9px;">CNPJ: 03.758.336/0001-06</p>
        </td>
      </tr></table>
    </div>
  </td></tr>

  <!-- FOOTER ESCURO -->
  <tr><td style="background:#111111;border-radius:0 0 12px 12px;padding:20px 44px;">
    <p style="margin:0;color:#666666;font-size:9px;letter-spacing:1px;">AV. ZILDA SEIXAS AMARAL, 3400 · APUCARANA — PR</p>
    <p style="margin:4px 0 0;color:#666666;font-size:9px;letter-spacing:1px;">(43) 3420-7777 · COMERCIAL@GRAFINORTE.COM.BR</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export async function sendQuoteEmail(opts: {
  smtpEmail: string;
  smtpAppPassword: string;
  to: string;
  quote: EmailQuoteData;
  pdfBuffer: Buffer;
}) {
  if (!opts.smtpEmail || !opts.smtpAppPassword) {
    throw new HttpError(400, "Configure seu e-mail SMTP no perfil antes de enviar.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: opts.smtpEmail, pass: opts.smtpAppPassword },
  });

  await transporter.verify().catch(() => {
    throw new HttpError(400, "Credenciais de e-mail inválidas. Verifique o e-mail e a senha de app no seu perfil.");
  });

  await transporter.sendMail({
    from: `"${opts.quote.createdBy.name} · Grafinorte" <${opts.smtpEmail}>`,
    to: opts.to,
    subject: `Proposta Comercial Grafinorte – Orçamento Nº ${opts.quote.number}`,
    html: buildHtml(opts.quote),
    attachments: [
      {
        filename: `orcamento-${opts.quote.number}.pdf`,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
