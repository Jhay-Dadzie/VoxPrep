import multer, { memoryStorage, MulterError } from 'multer';
import { describeRejection, isSupportedDocument } from '../utils/documentFormats.js';
import { AppError } from '../errors/appError.js';

const storage = memoryStorage();

/**
 * A slide deck carrying its images is several times the size of the same
 * material as a PDF, and 5MB turned an ordinary lecture deck away. The bytes
 * live in memory only for the length of the request — long enough to extract
 * the text and be discarded — so the ceiling is about what a student actually
 * has on their phone, not about storage.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const fileFilter = (req, file, cb) => {
  if (isSupportedDocument(file.originalname, file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(describeRejection(file.originalname, file.mimetype), 400), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: fileFilter,
});

/**
 * Multer's own failures are plain errors with no status, so an oversized file
 * reached the global handler as a 500 — the client showed "something went
 * wrong" for a problem the user could have fixed by picking a smaller file.
 * Translating here keeps every upload route reporting the real reason.
 */
const withUploadErrors = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => {
    if (err instanceof MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB. Upload a smaller one.`
        : `Upload failed: ${err.message}`;
      return next(new AppError(message, 400));
    }
    return next(err);
  });

export const uploadJobDocument = withUploadErrors(upload.single('document'));

/**
 * A candidate's CV, on the tailoring flow. Same limits and same accepted types
 * as a job document — a separate field name only so the two uploads read
 * distinctly at the call site and in client code.
 */
export const uploadCvDocument = withUploadErrors(upload.single('cv'));
