import path from "node:path";

const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

function listFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = Object.freeze({
  host: process.env.HOST ?? "0.0.0.0",
  port: numberFromEnv("PORT", 3000),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads")),
  maxFileSize: numberFromEnv("UPLOAD_MAX_FILE_SIZE", DEFAULT_MAX_FILE_SIZE),
  maxFiles: numberFromEnv("UPLOAD_MAX_FILES", 10),
  allowedMimeTypes: listFromEnv("UPLOAD_ALLOWED_MIME_TYPES"),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "")
});
