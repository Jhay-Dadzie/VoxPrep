import multer, { memoryStorage } from 'multer';

const storage = memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOCX, and TXT files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter,
});

export const uploadJobDocument = upload.single('document');

/**
 * A candidate's CV, on the tailoring flow. Same limits and same accepted types
 * as a job document — a separate field name only so the two uploads read
 * distinctly at the call site and in client code.
 */
export const uploadCvDocument = upload.single('cv');