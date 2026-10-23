import { PDFDocument, PDFName, PDFDict, PDFNumber, PDFArray, PDFRawStream } from "pdf-lib";
import type { ImageInfo, ImageEntry } from "../preflight.types";
import { PREFLIGHT_CONFIG } from "../preflight.config";
import { resolve, getPageResources, ptToMm } from "./stream.utils";

/**
 * Try to determine effective DPI of an image from its CTM (current transformation matrix).
 * The CTM is in the content stream, which we don't fully parse here.
 * We use the image's intrinsic pixel dimensions and estimate from page size.
 */
function estimateImageEntry(
  name: string,
  imgDict: PDFDict,
  doc: PDFDocument,
  pageIndex: number
): ImageEntry {
  let widthPx = 0;
  let heightPx = 0;
  let colorSpaceName: string | undefined;

  try {
    const wEntry = imgDict.get(PDFName.of("Width"));
    const hEntry = imgDict.get(PDFName.of("Height"));
    if (wEntry instanceof PDFNumber) widthPx = Math.round(wEntry.asNumber());
    if (hEntry instanceof PDFNumber) heightPx = Math.round(hEntry.asNumber());

    const csEntry = imgDict.get(PDFName.of("ColorSpace"));
    if (csEntry) {
      const cs = resolve(doc, csEntry);
      if (cs instanceof PDFName) {
        colorSpaceName = cs.asString().replace(/^\//, "");
      } else if (cs instanceof PDFArray && cs.size() > 0) {
        const first = cs.get(0);
        if (first instanceof PDFName) colorSpaceName = first.asString().replace(/^\//, "");
      }
    }
  } catch {
    // use defaults
  }

  // DPI cannot be determined without parsing the CTM from the content stream
  // We mark it as null (undetermined) as per spec
  const isLowRes = false; // cannot determine without DPI

  return {
    name,
    widthPx,
    heightPx,
    dpiEffective: null, // Cannot reliably determine without CTM parsing
    colorSpace: colorSpaceName,
    isLowRes,
  };
}

export function analyzeImages(doc: PDFDocument, pageIndex: number): ImageInfo {
  const images: ImageEntry[] = [];

  try {
    const resources = getPageResources(doc, pageIndex);
    if (!resources) return { count: 0, lowResCount: 0, images: [], confidence: "confirmed" };

    const xobjEntry = resources.get(PDFName.of("XObject"));
    if (!xobjEntry) return { count: 0, lowResCount: 0, images: [], confidence: "confirmed" };

    const xobjDict = resolve(doc, xobjEntry);
    if (!(xobjDict instanceof PDFDict)) return { count: 0, lowResCount: 0, images: [], confidence: "confirmed" };

    for (const [key, value] of xobjDict.entries()) {
      const xobjRaw = resolve(doc, value);
      // XObject streams are PDFRawStream, not PDFDict — unwrap the stream dict
      let xobj: PDFDict | null = null;
      if (xobjRaw instanceof PDFRawStream) {
        xobj = xobjRaw.dict;
      } else if (xobjRaw instanceof PDFDict) {
        xobj = xobjRaw;
      }
      if (!xobj) continue;

      const subtype = xobj.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName)) continue;
      if (subtype.asString().replace(/^\//, "") !== "Image") continue;

      const imgName = key instanceof PDFName ? key.asString().replace(/^\//, "") : String(key);
      const entry = estimateImageEntry(imgName, xobj, doc, pageIndex);
      images.push(entry);
    }
  } catch {
    // return what we have
  }

  return {
    count: images.length,
    lowResCount: images.filter((i) => i.isLowRes).length,
    images,
    // DPI is "unknown" because we don't parse CTM
    confidence: "unknown",
  };
}
