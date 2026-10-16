import { maxPhotoBytes } from "@fox-renard/api/client";

/** The longest side a Photo keeps, which a phone screen shows sharp. */
const maxSide = 1600;

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("The canvas made no image")),
      type,
      quality,
    ),
  );
}

/**
 * A photo as Fox Renard stores it: redrawn on a canvas, which keeps the
 * pixels and nothing else, so no GPS position or camera name leaves the
 * device. WebP where the browser makes it, PNG elsewhere, smaller each try
 * until it fits under the size limit.
 */
export async function preparedPhoto(file: File): Promise<Blob> {
  // Turned upright by its EXIF orientation, which then stays behind.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  try {
    for (;;) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const webp = await canvasBlob(canvas, "image/webp", 0.8);
      const blob =
        webp.type === "image/webp"
          ? webp
          : await canvasBlob(canvas, "image/png");
      if (blob.size <= maxPhotoBytes) return blob;
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
}
