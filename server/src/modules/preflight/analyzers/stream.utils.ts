import zlib from "zlib";
import {
  PDFDict,
  PDFName,
  PDFArray,
  PDFRef,
  PDFRawStream,
  PDFDocument,
  PDFNumber,
} from "pdf-lib";

/**
 * Try to decompress a raw stream buffer based on its Filter entry.
 * Returns the decoded bytes, or null if the filter is unknown/fails.
 */
export function decodeStream(streamDict: PDFDict, rawBytes: Uint8Array): Uint8Array | null {
  const filterEntry = streamDict.get(PDFName.of("Filter"));
  if (!filterEntry) return rawBytes; // no compression

  let filterName: string | null = null;
  if (filterEntry instanceof PDFName) {
    filterName = filterEntry.asString();
  } else if (filterEntry instanceof PDFArray && filterEntry.size() === 1) {
    const first = filterEntry.get(0);
    if (first instanceof PDFName) filterName = first.asString();
  }

  if (!filterName) return null; // multi-filter or unknown

  if (filterName === "/FlateDecode" || filterName === "FlateDecode") {
    try {
      return new Uint8Array(zlib.inflateSync(Buffer.from(rawBytes)));
    } catch {
      try {
        return new Uint8Array(zlib.inflateRawSync(Buffer.from(rawBytes)));
      } catch {
        return null;
      }
    }
  }

  if (filterName === "/ASCIIHexDecode" || filterName === "ASCIIHexDecode") {
    // Simple ASCII hex decode
    try {
      const hex = Buffer.from(rawBytes)
        .toString("ascii")
        .replace(/\s+/g, "")
        .replace(/>$/, "");
      return Buffer.from(hex, "hex");
    } catch {
      return null;
    }
  }

  // LZWDecode, ASCII85Decode, etc. — not handled, return null
  return null;
}

/**
 * Resolve a PDF object, following refs.
 */
export function resolve(doc: PDFDocument, obj: unknown): unknown {
  if (obj instanceof PDFRef) {
    return doc.context.lookup(obj);
  }
  return obj;
}

/**
 * Get content stream bytes for a page, decoded.
 * Returns empty buffer if the stream cannot be decoded.
 */
export function getPageContentStreamText(
  doc: PDFDocument,
  pageIndex: number
): string {
  try {
    const page = doc.getPage(pageIndex);
    const contentsEntry = page.node.get(PDFName.of("Contents"));
    if (!contentsEntry) return "";

    const streams: Uint8Array[] = [];

    const collectStream = (obj: unknown): void => {
      const resolved = resolve(doc, obj);
      if (resolved instanceof PDFRawStream) {
        const decoded = decodeStream(resolved.dict, resolved.contents);
        if (decoded) streams.push(decoded);
      } else if (resolved instanceof PDFArray) {
        for (let i = 0; i < resolved.size(); i++) {
          collectStream(resolved.get(i));
        }
      }
    };

    collectStream(contentsEntry);

    if (streams.length === 0) return "";

    // Combine all stream buffers
    const totalLen = streams.reduce((s, b) => s + b.length, 0);
    const combined = Buffer.alloc(totalLen);
    let offset = 0;
    for (const s of streams) {
      combined.set(s, offset);
      offset += s.length;
    }
    return combined.toString("latin1");
  } catch {
    return "";
  }
}

/**
 * Get Resources dict for a page, walking up the page tree for inherited resources.
 */
export function getPageResources(doc: PDFDocument, pageIndex: number): PDFDict | null {
  try {
    const page = doc.getPage(pageIndex);

    // First: check the page node directly
    const res = page.node.get(PDFName.of("Resources"));
    if (res) {
      const resolved = resolve(doc, res);
      if (resolved instanceof PDFDict) return resolved;
    }

    // Inherited resources: walk up the page tree (Parent nodes)
    let node: unknown = page.node.get(PDFName.of("Parent"));
    for (let depth = 0; depth < 8 && node; depth++) {
      const parentNode = resolve(doc, node);
      if (!(parentNode instanceof PDFDict)) break;
      const parentRes = parentNode.get(PDFName.of("Resources"));
      if (parentRes) {
        const resolved = resolve(doc, parentRes);
        if (resolved instanceof PDFDict) return resolved;
      }
      node = parentNode.get(PDFName.of("Parent"));
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Decode PDF name encoding: #XX hex sequences → actual characters.
 * Example: "PANTONE#20186#20C" → "PANTONE 186 C"
 */
export function decodePdfName(name: string): string {
  return name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Safely get a PDFNumber value from a dict entry.
 */
export function getNumberFromDict(dict: PDFDict, key: string): number | null {
  try {
    const val = dict.get(PDFName.of(key));
    if (val instanceof PDFNumber) return val.asNumber();
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a box array (4 numbers) into {x1,y1,x2,y2}.
 */
export function parseBoxArray(
  doc: PDFDocument,
  arr: PDFArray
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (arr.size() < 4) return null;
  try {
    const nums = [0, 1, 2, 3].map((i) => {
      const v = resolve(doc, arr.get(i));
      if (v instanceof PDFNumber) return v.asNumber();
      return null;
    });
    if (nums.some((n) => n === null)) return null;
    return { x1: nums[0]!, y1: nums[1]!, x2: nums[2]!, y2: nums[3]! };
  } catch {
    return null;
  }
}

/** Points to mm */
export function ptToMm(pt: number): number {
  return pt * 25.4 / 72;
}
