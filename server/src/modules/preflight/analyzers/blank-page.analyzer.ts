import { PDFDocument, PDFName } from "pdf-lib";
import { resolve, getPageContentStreamText, getPageResources } from "./stream.utils";

/**
 * Heuristically detect if a page appears blank.
 * A page is likely blank if:
 * - It has no content stream, OR
 * - Its content stream is very small (< 100 bytes after decode), AND
 * - It has no image XObjects in its resources
 */
export function isPageBlank(doc: PDFDocument, pageIndex: number): boolean {
  try {
    const page = doc.getPage(pageIndex);
    const contentsEntry = page.node.get(PDFName.of("Contents"));

    if (!contentsEntry) return true;

    const streamText = getPageContentStreamText(doc, pageIndex);

    // Remove whitespace-only content
    const stripped = streamText.replace(/\s+/g, "").replace(/[qQ]/g, "");

    if (stripped.length < 10) {
      // Check for any image XObjects
      const resources = getPageResources(doc, pageIndex);
      if (!resources) return true;

      const xobjEntry = resources.get(PDFName.of("XObject"));
      if (!xobjEntry) return true;

      return false; // has XObjects, might have images
    }

    return false;
  } catch {
    return false;
  }
}
