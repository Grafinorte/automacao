import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFRawStream } from "pdf-lib";
import type { PdfxInfo } from "../preflight.types";
import { resolve } from "./stream.utils";

/** Try to extract the description string from an ICC profile binary stream. */
function readIccDescription(rawBytes: Uint8Array): string | null {
  try {
    // ICC profile: 128-byte header, then tag table
    // "desc" tag contains the profile description
    const buf = Buffer.from(rawBytes);
    if (buf.length < 132) return null;
    const tagCount = buf.readUInt32BE(128);
    for (let i = 0; i < tagCount && i < 50; i++) {
      const offset = 132 + i * 12;
      if (offset + 12 > buf.length) break;
      const sig = buf.slice(offset, offset + 4).toString("ascii");
      if (sig === "desc") {
        const dataOffset = buf.readUInt32BE(offset + 4);
        const dataSize   = buf.readUInt32BE(offset + 8);
        if (dataOffset + dataSize > buf.length || dataSize < 12) break;
        const typeSig = buf.slice(dataOffset, dataOffset + 4).toString("ascii");
        if (typeSig === "desc") {
          // old ICC "desc" tag: 4 type + 4 reserved + 4 length + ASCII string
          const strLen = buf.readUInt32BE(dataOffset + 8);
          if (strLen > 0 && strLen < 256 && dataOffset + 12 + strLen <= buf.length) {
            const desc = buf.slice(dataOffset + 12, dataOffset + 12 + strLen).toString("ascii").replace(/\0/g, "").trim();
            if (desc) return desc;
          }
        } else if (typeSig === "mluc") {
          // new-style multilingual unicode: 4 type + 4 reserved + 4 count + 4 size + 2 lang + 2 country + 4 strLen + 4 offset
          const count = buf.readUInt32BE(dataOffset + 8);
          if (count > 0 && dataOffset + 28 <= buf.length) {
            const strLen = buf.readUInt32BE(dataOffset + 20);
            const strOff = buf.readUInt32BE(dataOffset + 24);
            const absOff = dataOffset + strOff;
            if (absOff + strLen <= buf.length && strLen < 512) {
              const desc = buf.slice(absOff, absOff + strLen).toString("utf16le").replace(/\0/g, "").trim();
              if (desc) return desc;
            }
          }
        }
        break;
      }
    }
  } catch { /* best-effort */ }
  return null;
}

export function analyzePdfX(doc: PDFDocument): PdfxInfo {
  try {
    const catalog = doc.catalog;

    const outputIntentsEntry = catalog.get(PDFName.of("OutputIntents"));
    if (!outputIntentsEntry) return { hasOutputIntent: false };

    const outputIntents = resolve(doc, outputIntentsEntry);
    if (!(outputIntents instanceof PDFArray) || outputIntents.size() === 0) {
      return { hasOutputIntent: false };
    }

    const firstIntent = resolve(doc, outputIntents.get(0));
    if (!(firstIntent instanceof PDFDict)) return { hasOutputIntent: false };

    let outputIntentProfile: string | undefined;
    let conformance: string | undefined;

    // Priority 1: OutputCondition — human-readable name (e.g. "FOGRA39 …")
    const oc = firstIntent.get(PDFName.of("OutputCondition"));
    if (oc instanceof PDFString) {
      const v = oc.asString().trim();
      if (v && v.toLowerCase() !== "custom") outputIntentProfile = v;
    }

    // Priority 2: OutputConditionIdentifier — standard short code (e.g. "FOGRA39")
    if (!outputIntentProfile) {
      const oci = firstIntent.get(PDFName.of("OutputConditionIdentifier"));
      if (oci instanceof PDFString) {
        const v = oci.asString().trim();
        if (v && v.toLowerCase() !== "custom") outputIntentProfile = v;
      } else if (oci instanceof PDFName) {
        const v = oci.asString().replace(/^\//, "").trim();
        if (v && v.toLowerCase() !== "custom") outputIntentProfile = v;
      }
    }

    // Priority 3: ICC profile description embedded in DestOutputProfile stream
    const destProfileRef = firstIntent.get(PDFName.of("DestOutputProfile"));
    if (destProfileRef) {
      try {
        const iccStream = resolve(doc, destProfileRef);
        if (iccStream instanceof PDFRawStream) {
          const desc = readIccDescription(iccStream.contents);
          if (desc && (!outputIntentProfile || outputIntentProfile.toLowerCase() === "custom")) {
            outputIntentProfile = desc;
          } else if (desc && outputIntentProfile) {
            // Append ICC description if it adds info (e.g. OCI is "FOGRA39" but desc has full name)
            if (!outputIntentProfile.toLowerCase().includes(desc.toLowerCase()) &&
                !desc.toLowerCase().includes(outputIntentProfile.toLowerCase())) {
              outputIntentProfile = `${outputIntentProfile} (${desc})`;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Conformance from S entry
    const sEntry = firstIntent.get(PDFName.of("S"));
    if (sEntry instanceof PDFName) {
      const s = sEntry.asString().replace(/^\//, "");
      if (s === "GTS_PDFX") conformance = "PDF/X";
    }

    // Conformance from XMP metadata (more precise: PDF/X-1a:2001, PDF/X-4, etc.)
    try {
      const xmpMeta = doc.catalog.get(PDFName.of("Metadata"));
      if (xmpMeta) {
        const xmpStream = resolve(doc, xmpMeta);
        if (xmpStream && typeof (xmpStream as { contents?: Uint8Array }).contents !== "undefined") {
          const xmpText = Buffer.from((xmpStream as { contents: Uint8Array }).contents).toString("utf8");
          const m = /pdfx:GTS_PDFXConformance[^>]*>([^<]+)</.exec(xmpText) ??
                    /GTS_PDFXVersion[^>]*>([^<]+)</.exec(xmpText) ??
                    /<pdfxid:GTS_PDFXVersion>([^<]+)</.exec(xmpText);
          if (m) conformance = m[1].trim();
        }
      }
    } catch { /* XMP is best-effort */ }

    return { hasOutputIntent: true, outputIntentProfile, conformance };
  } catch {
    return { hasOutputIntent: false };
  }
}
