import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import multer from "multer";
import morgan from "morgan";
import { config } from "./config";

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "HTTP_ERROR"
  ) {
    super(message);
  }
}

type StoredFile = {
  fieldName?: string;
  originalName?: string;
  fileName: string;
  mimeType?: string;
  size: number;
  url: string;
  uploadedAt?: string;
};

function ensureUploadDir(): void {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

function sanitizeName(originalName: string): string {
  const parsed = path.parse(originalName);
  const base = (parsed.name || "file")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
  const ext = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 16);

  return `${base}${ext}`;
}

function buildStoredName(originalName: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  return `${timestamp}-${crypto.randomUUID()}-${sanitizeName(originalName)}`;
}

function publicFileUrl(fileName: string): string {
  const pathPart = `/files/${encodeURIComponent(fileName)}`;

  return config.publicBaseUrl ? `${config.publicBaseUrl}${pathPart}` : pathPart;
}

function toStoredFile(file: Express.Multer.File): StoredFile {
  return {
    fieldName: file.fieldname,
    originalName: file.originalname,
    fileName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    url: publicFileUrl(file.filename)
  };
}

function resolveStoredFile(fileName: string): string {
  if (path.basename(fileName) !== fileName) {
    throw new HttpError(400, "Invalid file name", "INVALID_FILE_NAME");
  }

  const root = path.resolve(config.uploadDir);
  const resolved = path.resolve(root, fileName);

  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(400, "Invalid file name", "INVALID_FILE_NAME");
  }

  return resolved;
}

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadDir();
    callback(null, config.uploadDir);
  },
  filename: (_req, file, callback) => {
    callback(null, buildStoredName(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize,
    files: config.maxFiles
  },
  fileFilter: (_req, file, callback) => {
    if (
      config.allowedMimeTypes.length > 0 &&
      !config.allowedMimeTypes.includes(file.mimetype)
    ) {
      callback(
        new HttpError(
          415,
          `Unsupported file type: ${file.mimetype}`,
          "UNSUPPORTED_FILE_TYPE"
        )
      );
      return;
    }

    callback(null, true);
  }
});

export const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "file-upload-server",
    endpoints: {
      health: "GET /health",
      upload: "POST /upload",
      list: "GET /files",
      download: "GET /files/:fileName"
    }
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uploadDir: config.uploadDir,
    maxFileSize: config.maxFileSize,
    maxFiles: config.maxFiles
  });
});

app.post("/upload", upload.any(), (req: Request, res: Response, next: NextFunction) => {
  const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

  if (files.length === 0) {
    next(new HttpError(400, "No files uploaded", "NO_FILES_UPLOADED"));
    return;
  }

  res.status(201).json({
    files: files.map(toStoredFile)
  });
});

app.get("/files", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let entries: fs.Dirent[];

    try {
      entries = await fsp.readdir(config.uploadDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      entries = [];
    }

    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry): Promise<StoredFile> => {
          const filePath = path.join(config.uploadDir, entry.name);
          const stat = await fsp.stat(filePath);

          return {
            fileName: entry.name,
            size: stat.size,
            url: publicFileUrl(entry.name),
            uploadedAt: stat.mtime.toISOString()
          };
        })
    );

    files.sort((left, right) => {
      return (right.uploadedAt ?? "").localeCompare(left.uploadedAt ?? "");
    });

    res.json({ files });
  } catch (error) {
    next(error);
  }
});

app.get("/files/:fileName", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filePath = resolveStoredFile(req.params.fileName);
    await fsp.access(filePath, fs.constants.R_OK);
    res.download(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      next(new HttpError(404, "File not found", "FILE_NOT_FOUND"));
      return;
    }

    next(error);
  }
});

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new HttpError(404, "Route not found", "ROUTE_NOT_FOUND"));
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "INTERNAL_SERVER_ERROR";
  const message = status >= 500 ? "Internal server error" : error.message;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      code,
      message
    }
  });
});
