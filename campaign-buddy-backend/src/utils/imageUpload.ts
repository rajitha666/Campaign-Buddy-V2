import type { Request } from "express";
import type { FileFilterCallback } from "multer";
import { ApiError } from "./apiResponse";

// Uploads are served statically from /uploads, and the static server picks the
// Content-Type from the file extension. So the extension must come from a
// verified image type — never from the client's filename (an "x.html" sent as
// image/png would otherwise be served back as a web page). SVG is deliberately
// absent: it can carry scripts.
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export function imageExtension(mimetype: string): string | null {
  return EXTENSIONS[mimetype.toLowerCase()] ?? null;
}

export function imageFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!imageExtension(file.mimetype)) return cb(new ApiError(400, "VALIDATION_ERROR", "Only JPEG, PNG, WebP, GIF or HEIC images are allowed"));
  cb(null, true);
}
