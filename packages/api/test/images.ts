// Tiny real images, built byte by byte with the metadata a test asks for, so
// that each test shows exactly which chunk the API refuses.
import { crc32 } from "node:zlib";

/** A 2×2 lossless WebP, as PIL encodes it: RIFF, WEBP, one VP8L chunk. */
const vp8l = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQvCIXpf+BiOh/AAA=",
  "base64",
).subarray(12);

/** A 2×2 PNG, as PIL encodes it: IHDR, IDAT, IEND. */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGM8UaHBwMDAxMDAwMDAAAARqgFsecZ2JgAAAABJRU5ErkJggg==",
  "base64",
);

/** Exif with a GPS position, as a camera writes it. */
const exif = Buffer.from("Exif\0\0MM\0*\0\0\0\x08GPS 45.0;5.6", "latin1");
const xmp = Buffer.from(
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>45,0N</exif:GPSLatitude></x:xmpmeta>',
);

function webpChunk(fourCc: string, data: Uint8Array): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  const padding = Buffer.alloc(data.length % 2);
  return Buffer.concat([Buffer.from(fourCc, "latin1"), size, data, padding]);
}

/**
 * A WebP Photo, with the metadata chunks asked for. Metadata needs the
 * extended format, whose VP8X chunk flags it.
 */
export function webpPhoto({
  withExif = false,
  withXmp = false,
  padTo = 0,
}: {
  withExif?: boolean;
  withXmp?: boolean;
  /** Pads the image data so the file weighs about this many bytes. */
  padTo?: number;
} = {}): Uint8Array {
  const image = padTo
    ? webpChunk("VP8L", Buffer.concat([vp8l.subarray(8), Buffer.alloc(padTo)]))
    : vp8l;
  const chunks: Buffer[] = [];
  if (withExif || withXmp) {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = (withExif ? 0x08 : 0) | (withXmp ? 0x04 : 0);
    // Width and height minus one, on 24 bits each: 2×2.
    vp8x.writeUIntLE(1, 4, 3);
    vp8x.writeUIntLE(1, 7, 3);
    chunks.push(webpChunk("VP8X", vp8x));
  }
  chunks.push(image);
  if (withExif) chunks.push(webpChunk("EXIF", exif));
  if (withXmp) chunks.push(webpChunk("XMP ", xmp));
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), size, body]);
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A PNG Photo, as a browser that cannot make WebP sends it, with the metadata asked for. */
export function pngPhoto({
  withExif = false,
  withXmp = false,
}: {
  withExif?: boolean;
  withXmp?: boolean;
} = {}): Uint8Array {
  const signature = png.subarray(0, 8);
  const ihdrEnd = 8 + 12 + 13;
  const metadata = [
    ...(withExif ? [pngChunk("eXIf", exif.subarray(6))] : []),
    ...(withXmp
      ? [
          pngChunk(
            "iTXt",
            Buffer.concat([
              Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"),
              xmp,
            ]),
          ),
        ]
      : []),
  ];
  return Buffer.concat([
    signature,
    png.subarray(8, ihdrEnd),
    ...metadata,
    png.subarray(ihdrEnd),
  ]);
}

/** The first bytes of a JPEG, which the API never takes. */
export const jpegPhoto = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
]);
