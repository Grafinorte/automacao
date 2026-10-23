import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFString, PDFNumber, PDFRawStream } from "pdf-lib";
import type { ColorInfo } from "../preflight.types";
import { resolve, getPageResources, getPageContentStreamText, decodePdfName } from "./stream.utils";

/**
 * Walk a Resources ColorSpace dict and collect named color space types.
 */
function collectColorSpacesFromResources(
  doc: PDFDocument,
  resources: PDFDict,
  visited: Set<number>,
  result: ColorInfo
): void {
  const csEntry = resources.get(PDFName.of("ColorSpace"));
  if (!csEntry) return;
  const csDict = resolve(doc, csEntry);
  if (!(csDict instanceof PDFDict)) return;

  for (const [, value] of csDict.entries()) {
    analyzeColorSpaceObject(doc, resolve(doc, value), visited, result);
  }
}

/**
 * Analyze a single color space object (PDFName or PDFArray).
 */
function analyzeColorSpaceObject(
  doc: PDFDocument,
  csObj: unknown,
  visited: Set<number>,
  result: ColorInfo
): void {
  if (csObj instanceof PDFRef) {
    if (visited.has(csObj.objectNumber)) return;
    visited.add(csObj.objectNumber);
    csObj = resolve(doc, csObj);
  }

  if (csObj instanceof PDFName) {
    const name = csObj.asString().replace(/^\//, "");
    if (name === "DeviceCMYK") {
      result.hasCmyk = true;
      // CMYK color space = all 4 channels are potentially used
      if (!result.cmykChannels) result.cmykChannels = { c: false, m: false, y: false, k: false };
      result.cmykChannels.c = true;
      result.cmykChannels.m = true;
      result.cmykChannels.y = true;
      result.cmykChannels.k = true;
    } else if (name === "DeviceRGB") {
      result.hasRgb = true;
    } else if (name === "DeviceGray") {
      result.hasGray = true;
    }
    if (!result.colorSpaceNames.includes(name)) result.colorSpaceNames.push(name);
    return;
  }

  if (csObj instanceof PDFArray && csObj.size() > 0) {
    const typeObj = csObj.get(0);
    if (!(typeObj instanceof PDFName)) return;
    const csType = typeObj.asString().replace(/^\//, "");

    if (csType === "ICCBased") {
      // Read N from the ICC stream dict: 1=Gray, 3=RGB, 4=CMYK
      if (csObj.size() > 1) {
        try {
          const iccRef = csObj.get(1);
          const iccObj = resolve(doc, iccRef);
          const iccDict =
            iccObj instanceof PDFRawStream ? iccObj.dict : iccObj instanceof PDFDict ? iccObj : null;
          if (iccDict) {
            const nObj = iccDict.get(PDFName.of("N"));
            if (nObj instanceof PDFNumber) {
              const n = nObj.asNumber();
              if (n === 4) {
                result.hasCmyk = true;
                // ICCBased CMYK = all 4 channels present (can't decode per-pixel without image data)
                if (!result.cmykChannels) result.cmykChannels = { c: false, m: false, y: false, k: false };
                result.cmykChannels.c = true;
                result.cmykChannels.m = true;
                result.cmykChannels.y = true;
                result.cmykChannels.k = true;
              } else if (n === 3) {
                result.hasRgb = true;
              } else if (n === 1) {
                result.hasGray = true;
              }
            }
          }
        } catch { /* ignore parse errors for ICC streams */ }
      }
      if (!result.colorSpaceNames.includes("ICCBased")) {
        result.colorSpaceNames.push("ICCBased");
      }
      return;
    }

    if (csType === "Separation") {
      result.hasSpot = true;
      // 2nd element is the colorant name
      if (csObj.size() > 1) {
        const colorantObj = resolve(doc, csObj.get(1));
        let spotName = "Unknown";
        if (colorantObj instanceof PDFName) {
          spotName = decodePdfName(colorantObj.asString().replace(/^\//, ""));
        } else if (colorantObj instanceof PDFString) {
          spotName = decodePdfName(colorantObj.asString());
        }
        if (!result.spotColorNames.includes(spotName)) {
          result.spotColorNames.push(spotName);
        }
      }
      if (!result.colorSpaceNames.includes("Separation")) {
        result.colorSpaceNames.push("Separation");
      }
      return;
    }

    if (csType === "DeviceN") {
      result.hasSpot = true;
      // 2nd element is array of colorant names
      if (csObj.size() > 1) {
        const names = resolve(doc, csObj.get(1));
        if (names instanceof PDFArray) {
          for (let i = 0; i < names.size(); i++) {
            const n = resolve(doc, names.get(i));
            if (n instanceof PDFName) {
              const spotName = decodePdfName(n.asString().replace(/^\//, ""));
              if (
                spotName !== "None" &&
                spotName !== "All" &&
                !result.spotColorNames.includes(spotName)
              ) {
                result.spotColorNames.push(spotName);
              }
            }
          }
        }
      }
      if (!result.colorSpaceNames.includes("DeviceN")) {
        result.colorSpaceNames.push("DeviceN");
      }
      return;
    }

    if (csType === "DeviceCMYK") {
      result.hasCmyk = true;
      if (!result.cmykChannels) result.cmykChannels = { c: false, m: false, y: false, k: false };
      result.cmykChannels.c = true;
      result.cmykChannels.m = true;
      result.cmykChannels.y = true;
      result.cmykChannels.k = true;
    } else if (csType === "DeviceRGB") { result.hasRgb = true; }
    else if (csType === "DeviceGray") { result.hasGray = true; }
    else if (csType === "CalRGB") { result.hasRgb = true; }
    else if (csType === "CalGray") { result.hasGray = true; }
    else if (csType === "Lab") {
      if (!result.colorSpaceNames.includes("Lab")) result.colorSpaceNames.push("Lab");
    }

    if (!result.colorSpaceNames.includes(csType)) {
      result.colorSpaceNames.push(csType);
    }
  }
}

/**
 * Walk XObject resources to find embedded Form XObjects (which may have their own resources).
 */
function walkXObjects(
  doc: PDFDocument,
  resources: PDFDict,
  visited: Set<number>,
  result: ColorInfo,
  depth: number
): void {
  if (depth > 5) return; // prevent infinite recursion

  const xobjEntry = resources.get(PDFName.of("XObject"));
  if (!xobjEntry) return;
  const xobjDict = resolve(doc, xobjEntry);
  if (!(xobjDict instanceof PDFDict)) return;

  for (const [, value] of xobjDict.entries()) {
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

    const subtypeName = subtype.asString().replace(/^\//, "");
    if (subtypeName === "Form") {
      // Check if this form XObject has been visited
      if (value instanceof PDFRef) {
        if (visited.has(value.objectNumber)) continue;
        visited.add(value.objectNumber);
      }
      const formResources = xobj.get(PDFName.of("Resources"));
      if (formResources) {
        const formRes = resolve(doc, formResources);
        if (formRes instanceof PDFDict) {
          collectColorSpacesFromResources(doc, formRes, visited, result);
          walkXObjects(doc, formRes, visited, result, depth + 1);
        }
      }
    } else if (subtypeName === "Image") {
      // Check image color space
      const imageCs = xobj.get(PDFName.of("ColorSpace"));
      if (imageCs) {
        analyzeColorSpaceObject(doc, resolve(doc, imageCs), visited, result);
      }
    }
  }
}

/**
 * Analyze content stream operators to detect color usage.
 * Returns array of operator codes found.
 */
function analyzeContentStreamColors(
  streamText: string,
  result: ColorInfo
): void {
  // We scan for color operators
  // k/K = CMYK, rg/RG = RGB, g/G = Gray, cs/CS = named color space
  // We use a simple regex-based approach on the content stream

  // CMYK operators: 4 numbers followed by k or K (capture channel values for per-channel detection)
  const cmykPattern = /([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([kK])\b/g;
  let m = cmykPattern.exec(streamText);
  while (m) {
    result.hasCmyk = true;
    if (!result.cmykChannels) result.cmykChannels = { c: false, m: false, y: false, k: false };
    const cVal = parseFloat(m[1]);
    const mVal = parseFloat(m[2]);
    const yVal = parseFloat(m[3]);
    const kVal = parseFloat(m[4]);
    if (cVal > 0.005) result.cmykChannels.c = true;
    if (mVal > 0.005) result.cmykChannels.m = true;
    if (yVal > 0.005) result.cmykChannels.y = true;
    if (kVal > 0.005) result.cmykChannels.k = true;
    if (!result.operatorsFound.includes(m[5])) result.operatorsFound.push(m[5]);
    m = cmykPattern.exec(streamText);
  }

  // RGB operators: 3 numbers followed by rg or RG
  const rgbPattern = /[\d.+-]+\s+[\d.+-]+\s+[\d.+-]+\s+(rg|RG)\b/g;
  let mr = rgbPattern.exec(streamText);
  while (mr) {
    result.hasRgb = true;
    if (!result.operatorsFound.includes(mr[1])) result.operatorsFound.push(mr[1]);
    mr = rgbPattern.exec(streamText);
  }

  // Gray operators: 1 number followed by g or G
  const grayPattern = /[\d.+-]+\s+([gG])\b/g;
  let mg = grayPattern.exec(streamText);
  while (mg) {
    result.hasGray = true;
    if (!result.operatorsFound.includes(mg[1])) result.operatorsFound.push(mg[1]);
    mg = grayPattern.exec(streamText);
  }

  // Named color space: cs/CS operators
  const csPattern = /\/([\w#]+)\s+(cs|CS)\b/g;
  let mc = csPattern.exec(streamText);
  while (mc) {
    const csName = decodePdfName(mc[1]);
    if (!result.colorSpaceNames.includes(csName)) result.colorSpaceNames.push(csName);
    if (!result.operatorsFound.includes(mc[2])) result.operatorsFound.push(mc[2]);
    mc = csPattern.exec(streamText);
  }

  // scn/SCN with name argument (spot colors)
  const scnPattern = /\/([\w#]+)\s+scn\b/gi;
  let ms = scnPattern.exec(streamText);
  while (ms) {
    result.hasSpot = true;
    const spotName = decodePdfName(ms[1]);
    if (!result.spotColorNames.includes(spotName)) result.spotColorNames.push(spotName);
    ms = scnPattern.exec(streamText);
  }
}

export function analyzeColors(doc: PDFDocument, pageIndex: number): ColorInfo {
  const result: ColorInfo = {
    confidence: "estimated",
    hasRgb: false,
    hasCmyk: false,
    hasGray: false,
    hasSpot: false,
    spotColorNames: [],
    colorSpaceNames: [],
    operatorsFound: [],
  };

  const visited = new Set<number>();
  const resources = getPageResources(doc, pageIndex);

  if (resources) {
    collectColorSpacesFromResources(doc, resources, visited, result);
    walkXObjects(doc, resources, visited, result, 0);
  }

  // Analyze content stream operators
  const streamText = getPageContentStreamText(doc, pageIndex);
  if (streamText) {
    analyzeContentStreamColors(streamText, result);
    result.confidence = "estimated";
  } else {
    result.confidence = "potential";
  }

  // If we found explicit operators, bump confidence
  if (result.operatorsFound.length > 0) {
    result.confidence = "confirmed";
  }

  // Ensure cmykChannels is populated whenever hasCmyk=true
  if (result.hasCmyk && !result.cmykChannels) {
    // Resource-dict only detection: can't determine per-channel, assume all four
    result.cmykChannels = { c: true, m: true, y: true, k: true };
  }

  // Gray content maps to K channel
  if (result.hasGray) {
    if (!result.cmykChannels) result.cmykChannels = { c: false, m: false, y: false, k: false };
    result.cmykChannels.k = true;
  }

  // Debug logging: helps trace color detection per page
  console.log(
    `[Preflight Color] p${pageIndex + 1}` +
    ` CMYK=${result.hasCmyk} RGB=${result.hasRgb} Gray=${result.hasGray} Spot=${result.hasSpot}` +
    ` ch=${JSON.stringify(result.cmykChannels)}` +
    ` cs=[${result.colorSpaceNames.join(",")}]` +
    ` ops=[${result.operatorsFound.join(",")}]`
  );

  return result;
}
