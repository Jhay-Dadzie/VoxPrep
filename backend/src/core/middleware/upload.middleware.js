import multer, { memoryStorage, MulterError } from 'multer';
import { describeRejection, isSupportedDocument } from '../utils/documentFormats.js';
import { AppError } from '../errors/appError.js';

const storage = memoryStorage();

const fileFilter = (req, file, cb) => {
  if (isSupportedDocument(file.originalname, file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(describeRejection(file.originalname, file.mimetype), 400), false);
  }
};

/**
 * No fileSize ceiling: a slide deck carrying its images is several times the
 * size of the same material as a PDF, and any figure picked here turned away
 * ordinary course material. The bytes live in memory only for the length of
 * the request — long enough to extract the text and be discarded.
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

/**
 * Multer's own failures are plain errors with no status, so a rejected upload
 * reached the global handler as a 500 — the client showed "something went
 * wrong" for a problem the user could have fixed themselves. Translating here
 * keeps every upload route reporting the real reason.
 */
const withUploadErrors = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => {
    if (err instanceof MulterError) {
      return next(new AppError(`Upload failed: ${err.message}`, 400));
    }
    return next(err);
  });

export const uploadJobDocument = withUploadErrors(upload.single('document'));

/**
 * A candidate's CV, on the tailoring flow. Same accepted types
 * as a job document — a separate field name only so the two uploads read
 * distinctly at the call site and in client code.
 */
export const uploadCvDocument = withUploadErrors(upload.single('cv'));
