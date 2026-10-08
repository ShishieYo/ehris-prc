import "server-only";
import { createHash, randomUUID } from "node:crypto";

export type PreparedUpload = {
  bytes: Buffer;
  mime: string;
  size: number;
  sha256: string;
  fileName: string;
  extension: string;
};

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];

export class UploadError extends Error {}

/** Strips directory parts and control characters from a user-supplied file name. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 120) || "file";
}

/**
 * Validates an uploaded file on the server: presence, size, allowed type, and
 * that the actual bytes match the allowed type (the browser-declared type is
 * not trusted). Messages are safe to show to users.
 */
export async function prepareUpload(file: File | null, opts: { maxMb: number; allowedMime: string[] }): Promise<PreparedUpload> {
  if (!file || file.size === 0) throw new UploadError("Choose a file to upload.");
  if (file.size > opts.maxMb * 1024 * 1024) throw new UploadError(`The file is larger than ${opts.maxMb} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig || !opts.allowedMime.includes(sig.mime)) {
    throw new UploadError("This file type isn't allowed. Upload a PDF, JPG or PNG file.");
  }
  return {
    bytes,
    mime: sig.mime,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    fileName: safeFileName(file.name),
    extension: sig.ext,
  };
}

/** Storage keys are random: {employee_id}/{uuid}.{ext}. The first segment drives storage RLS. */
export const storagePath = (employeeId: string, ext: string) => `${employeeId}/${randomUUID()}.${ext}`;

export const BUCKET = "personnel-documents";

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
