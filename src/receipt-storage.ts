import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "./authorization";

export const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;
export interface ReceiptStorage {
  uploadUrl(key: string, contentType: string): Promise<string>;
  finalize(key: string, contentType: string, size: number): Promise<string>;
  viewUrl(key: string): Promise<string>;
  remove(key: string): Promise<void>;
}

export function isReceiptImage(bytes: Uint8Array, type: string) {
  const b = Buffer.from(bytes);
  if (type === "image/png") return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/jpeg") return b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  return type === "image/webp" && b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
}

export function createR2Storage(config: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }): ReceiptStorage {
  const client = new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  const Bucket = config.bucket;
  return {
    uploadUrl: (Key, ContentType) => getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType }),
      { expiresIn: 300, signableHeaders: new Set(["content-type"]) }),
    viewUrl: (Key) => getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseCacheControl: "private, no-store" }), { expiresIn: 300 }),
    remove: async (Key) => { await client.send(new DeleteObjectCommand({ Bucket, Key })); },
    async finalize(Key, contentType, size) {
      // Read at most 5 MiB + 1 byte; never trust declared content length alone.
      let object;
      try { object = await client.send(new GetObjectCommand({ Bucket, Key, Range: `bytes=0-${MAX_RECEIPT_SIZE}` })); }
      catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") throw new HttpError(422, "Upload the receipt before submitting payment");
        throw error;
      }
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes || bytes.length !== size || bytes.length > MAX_RECEIPT_SIZE || object.ContentType !== contentType || !isReceiptImage(bytes, contentType)) {
        throw new HttpError(422, "Receipt must match the declared image type and size (maximum 5 MiB)");
      }
      // Signed PUT URLs are reusable. Store a separate, server-only final object so
      // a later staging upload can never change a submitted/approved receipt.
      const finalKey = `receipts/${crypto.randomUUID()}`;
      await client.send(new PutObjectCommand({ Bucket, Key: finalKey, Body: bytes, ContentType: contentType, CacheControl: "private, no-store" }));
      return finalKey;
    },
  };
}
