import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString } from "pdf-lib";
import type { FontInfo } from "../preflight.types";
import { resolve, getPageResources } from "./stream.utils";

/**
 * Determine if a font object is embedded by checking FontDescriptor.
 */
function checkFontEmbedding(
  doc: PDFDocument,
  fontDict: PDFDict
): { embedded: boolean; subset: boolean; fontName: string; fontType: string } {
  const defaults = { embedded: false, subset: false, fontName: "Unknown", fontType: "Unknown" };

  try {
    // Get font name
    const baseFontEntry = fontDict.get(PDFName.of("BaseFont"));
    let fontName = "Unknown";
    if (baseFontEntry instanceof PDFName) {
      fontName = baseFontEntry.asString().replace(/^\//, "");
    }

    // Get font type
    const subtypeEntry = fontDict.get(PDFName.of("Subtype"));
    const fontType = subtypeEntry instanceof PDFName
      ? subtypeEntry.asString().replace(/^\//, "")
      : "Unknown";

    // Check for subset prefix (6 uppercase letters followed by +)
    const subsetMatch = /^([A-Z]{6})\+/.exec(fontName);
    const isSubset = subsetMatch !== null;
    // Remove subset prefix for display
    const cleanName = isSubset ? fontName.replace(/^[A-Z]{6}\+/, "") : fontName;

    // Standard 14 fonts are always "available" but not embedded — treat as not embedded
    const standard14 = [
      "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
      "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
      "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
      "Symbol", "ZapfDingbats",
    ];
    if (standard14.includes(cleanName)) {
      return { embedded: false, subset: false, fontName: cleanName, fontType };
    }

    // For Type0 (composite fonts), check DescendantFonts
    if (fontType === "Type0") {
      const descendantsEntry = fontDict.get(PDFName.of("DescendantFonts"));
      if (descendantsEntry) {
        const descendants = resolve(doc, descendantsEntry);
        if (descendants instanceof PDFArray && descendants.size() > 0) {
          const descendant = resolve(doc, descendants.get(0));
          if (descendant instanceof PDFDict) {
            const fdEntry = descendant.get(PDFName.of("FontDescriptor"));
            if (fdEntry) {
              const fd = resolve(doc, fdEntry);
              if (fd instanceof PDFDict) {
                const hasFile =
                  fd.get(PDFName.of("FontFile")) !== undefined ||
                  fd.get(PDFName.of("FontFile2")) !== undefined ||
                  fd.get(PDFName.of("FontFile3")) !== undefined;
                return { embedded: hasFile, subset: isSubset, fontName: cleanName, fontType };
              }
            }
          }
        }
      }
      return { embedded: false, subset: isSubset, fontName: cleanName, fontType };
    }

    // For other font types (Type1, TrueType, Type3, etc.)
    const fdEntry = fontDict.get(PDFName.of("FontDescriptor"));
    if (!fdEntry) {
      // Type3 fonts are defined inline — they ARE "embedded" in the sense that
      // the glyph programs are in the PDF, but they don't follow normal embedding.
      if (fontType === "Type3") {
        return { embedded: true, subset: false, fontName: cleanName, fontType };
      }
      return { ...defaults, fontName: cleanName, fontType };
    }

    const fd = resolve(doc, fdEntry);
    if (!(fd instanceof PDFDict)) {
      return { ...defaults, fontName: cleanName, fontType };
    }

    const hasFile =
      fd.get(PDFName.of("FontFile")) !== undefined ||
      fd.get(PDFName.of("FontFile2")) !== undefined ||
      fd.get(PDFName.of("FontFile3")) !== undefined;

    return { embedded: hasFile, subset: isSubset, fontName: cleanName, fontType };
  } catch {
    return defaults;
  }
}

export function analyzeFonts(doc: PDFDocument, pageIndex: number): FontInfo[] {
  const fonts: FontInfo[] = [];
  const seen = new Set<string>();

  try {
    const resources = getPageResources(doc, pageIndex);
    if (!resources) return fonts;

    const fontEntry = resources.get(PDFName.of("Font"));
    if (!fontEntry) return fonts;

    const fontDict = resolve(doc, fontEntry);
    if (!(fontDict instanceof PDFDict)) return fonts;

    for (const [, value] of fontDict.entries()) {
      const fontObj = resolve(doc, value);
      if (!(fontObj instanceof PDFDict)) continue;

      const { embedded, subset, fontName, fontType } = checkFontEmbedding(doc, fontObj);

      // Deduplicate by font name
      const key = `${fontName}::${fontType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      fonts.push({
        name: fontName,
        type: fontType,
        embedded,
        subset,
        confidence: "confirmed",
      });
    }
  } catch {
    // Return whatever we collected so far
  }

  return fonts;
}
