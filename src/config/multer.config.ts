
import multer from 'multer';
import path from 'path';

// Disk storage — for general lesson PDF uploads
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// Memory storage — for PDF analysis (no disk I/O, no path issues)
const memoryStorage = multer.memoryStorage();

const pdfFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') {
        return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
};

// For general lesson PDF uploads (uses disk)
export const pdfUpload = multer({
    storage: diskStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: pdfFileFilter
});

// For PDF analysis — uses memory buffer directly (avoids disk corruption issues)
export const pdfAnalysisUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: pdfFileFilter
});
