import type { PhotoStore } from "@fox-renard/core";

/** The Photo store on an R2 bucket, S3-compatible object storage on Cloudflare. */
export function createR2PhotoStore(bucket: R2Bucket): PhotoStore {
  return {
    async put(key, { body, contentType }) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: new Uint8Array(await object.arrayBuffer()),
        contentType:
          object.httpMetadata?.contentType ?? "application/octet-stream",
      };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}
