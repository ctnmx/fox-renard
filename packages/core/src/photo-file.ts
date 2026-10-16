/**
 * What a Photo's bytes are, read from its container alone. The Widget strips
 * metadata before upload, but a client can skip that, so Core reads the file
 * itself and keeps only images made of known image chunks.
 */
import type { PhotoContentType } from "./model";

export type PhotoFile =
  | { outcome: "photo"; contentType: PhotoContentType }
  | { outcome: "not-a-photo" }
  | { outcome: "photo-has-metadata" };

/** The Photo store's key of a Photo's file. */
export function photoKey(photoId: string): string {
  return `photos/${photoId}`;
}

const notAPhoto = { outcome: "not-a-photo" } as const;
const hasMetadata = { outcome: "photo-has-metadata" } as const;

function fourCc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

function uint32(bytes: Uint8Array, at: number, littleEndian: boolean): number {
  return new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(
    0,
    littleEndian,
  );
}

/** The chunks a still WebP image holds besides its metadata. */
const webpImageChunks = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"]);

/** The VP8X flags that announce EXIF or XMP metadata, or an animation. */
const vp8xExif = 0x08;
const vp8xXmp = 0x04;
const vp8xAnimation = 0x02;

function webpFile(bytes: Uint8Array): PhotoFile {
  if (uint32(bytes, 4, true) + 8 !== bytes.length) return notAPhoto;
  let images = 0;
  let at = 12;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return notAPhoto;
    const type = fourCc(bytes, at);
    const size = uint32(bytes, at + 4, true);
    const end = at + 8 + size + (size % 2);
    if (end > bytes.length) return notAPhoto;
    if (type === "ANIM" || type === "ANMF") return notAPhoto;
    if (!webpImageChunks.has(type)) return hasMetadata;
    if (type === "VP8X") {
      // The extended header comes first, and holds its flags and size.
      if (at !== 12 || size !== 10) return notAPhoto;
      const flags = bytes[at + 8] ?? 0;
      if (flags & vp8xAnimation) return notAPhoto;
      if (flags & (vp8xExif | vp8xXmp)) return hasMetadata;
    }
    if (type === "VP8 " || type === "VP8L") images += 1;
    at = end;
  }
  return images === 1
    ? { outcome: "photo", contentType: "image/webp" }
    : notAPhoto;
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The chunks of a still PNG image besides its metadata: text, eXIf and
 * time chunks, and any chunk not listed, are refused.
 */
const pngImageChunks = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "sRGB",
  "gAMA",
  "cHRM",
  "iCCP",
  "sBIT",
  "bKGD",
  "pHYs",
]);

function pngFile(bytes: Uint8Array): PhotoFile {
  let at = pngSignature.length;
  let first = true;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) return notAPhoto;
    const size = uint32(bytes, at, false);
    const type = fourCc(bytes, at + 4);
    const end = at + 12 + size;
    if (end > bytes.length) return notAPhoto;
    if (first !== (type === "IHDR")) return notAPhoto;
    first = false;
    if (type === "acTL") return notAPhoto;
    if (!pngImageChunks.has(type)) return hasMetadata;
    if (type === "IEND") {
      return end === bytes.length
        ? { outcome: "photo", contentType: "image/png" }
        : notAPhoto;
    }
    at = end;
  }
  return notAPhoto;
}

/** Whether these bytes are a still WebP or PNG image free of metadata. */
export function photoFileOf(bytes: Uint8Array): PhotoFile {
  if (
    bytes.length >= 12 &&
    fourCc(bytes, 0) === "RIFF" &&
    fourCc(bytes, 8) === "WEBP"
  ) {
    return webpFile(bytes);
  }
  if (
    bytes.length > pngSignature.length &&
    pngSignature.every((byte, index) => bytes[index] === byte)
  ) {
    return pngFile(bytes);
  }
  return notAPhoto;
}
