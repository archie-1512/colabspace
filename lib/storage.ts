import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import type { S3Client } from "@aws-sdk/client-s3";

// Two storage backends behind one interface:
// - S3, when S3_BUCKET is set (production). Credentials come from the standard
//   AWS chain, i.e. the EC2 instance's IAM role, so no access keys live on the server.
// - Local disk otherwise (development, docker compose). Files live outside /public
//   so they're never served directly by Next's static file handler.
// Either way, every download goes through an API route that checks the
// requester actually has access to the card first.
const BUCKET = process.env.S3_BUCKET;
const S3_PREFIX = "uploads/";
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const g = globalThis as unknown as { __s3?: Promise<S3Client> };
function s3() {
  // Loaded lazily so local development never pulls in the AWS SDK.
  // S3_FORCE_PATH_STYLE=true is for S3-compatible stores (MinIO, LocalStack) only.
  g.__s3 ??= import("@aws-sdk/client-s3").then(
    ({ S3Client }) => new S3Client({ forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" })
  );
  return g.__s3;
}

export function generateStoredName(originalName: string) {
  const ext = path.extname(originalName);
  return `${randomBytes(16).toString("hex")}${ext}`;
}

export async function saveFile(storedName: string, buffer: Buffer, contentType?: string) {
  if (BUCKET) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(
      new PutObjectCommand({ Bucket: BUCKET, Key: S3_PREFIX + storedName, Body: buffer, ContentType: contentType })
    );
    return;
  }
  await mkdir(UPLOAD_ROOT, { recursive: true });
  await writeFile(path.join(UPLOAD_ROOT, storedName), buffer);
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  if (BUCKET) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: S3_PREFIX + storedName }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(path.join(UPLOAD_ROOT, storedName));
}

export async function deleteStoredFile(storedName: string) {
  try {
    if (BUCKET) {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await s3()).send(new DeleteObjectCommand({ Bucket: BUCKET, Key: S3_PREFIX + storedName }));
      return;
    }
    await unlink(path.join(UPLOAD_ROOT, storedName));
  } catch {
    // already gone — fine
  }
}
