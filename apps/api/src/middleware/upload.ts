import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../config/env';
import { AppError } from '../utils/errors';

let uploader: ReturnType<typeof multer> | undefined;

function getUploader() {
  if (!uploader) {
    uploader = multer({
      storage: multer.memoryStorage(), // buffered, validated, then written by the service under a server-generated name
      limits: { fileSize: getEnv().MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 10_000 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only PDF quotations (application/pdf) are accepted'));
          return;
        }
        cb(null, true);
      },
    });
  }
  return uploader;
}

/** Runs multer only for multipart requests (field name "file"); JSON requests pass straight through. */
export function optionalPdfUpload(req: Request, res: Response, next: NextFunction): void {
  if (req.is('multipart/form-data')) {
    getUploader().single('file')(req, res, next);
    return;
  }
  next();
}
