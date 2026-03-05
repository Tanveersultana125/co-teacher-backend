
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

/**
 * Service for PDF text extraction.
 * Accepts either a file path (disk upload) or a Buffer (memory upload).
 * No Tesseract — it cannot process PDFs (only images).
 */
export class OCRService {

    static async extractText(filePathOrBuffer: string | Buffer): Promise<string> {
        let dataBuffer: Buffer;

        if (Buffer.isBuffer(filePathOrBuffer)) {
            dataBuffer = filePathOrBuffer;
            console.log(`[OCR] Using in-memory buffer (${dataBuffer.length} bytes)`);
        } else {
            dataBuffer = fs.readFileSync(filePathOrBuffer);
            console.log(`[OCR] Read file from disk: ${filePathOrBuffer} (${dataBuffer.length} bytes)`);
        }

        if (!dataBuffer || dataBuffer.length < 10) {
            throw Object.assign(new Error('The uploaded file is empty or unreadable.'), { status: 422 });
        }

        // Attempt 1: strict parse
        try {
            const data = await pdfParse(dataBuffer);
            const text = data.text || '';

            if (text.replace(/\s/g, '').length < 10) {
                return 'This PDF appears to be a scanned image and has no extractable text. Please try a text-based PDF.';
            }

            console.log(`[OCR] Extracted ${text.length} characters (strict parse).`);
            return text;
        } catch (err1: any) {
            console.warn('[OCR] Strict parse failed, trying lenient parse:', err1.message);
        }

        // Attempt 2: lenient parse (ignores some XRef / structure errors)
        try {
            const data = await pdfParse(dataBuffer, { max: 0 });
            const text = data.text || '';

            if (text.replace(/\s/g, '').length < 10) {
                return 'This PDF appears to be empty or scanned. Please try a different file.';
            }

            console.log(`[OCR] Extracted ${text.length} characters (lenient parse).`);
            return text;
        } catch (err2: any) {
            console.error('[OCR] Both parse attempts failed:', err2.message);
            throw Object.assign(
                new Error('Could not read this PDF. It may be corrupted or password-protected. Please try a different PDF file.'),
                { status: 422 }
            );
        }
    }
}
