
import { Request, Response, NextFunction } from 'express';
import { OCRService } from '../services/analysis-ocr.service';
import { GroqAnalysisService } from '../services/groq-analysis.service';
import { cleanAndNormalizeText, splitIntoChunks, MAX_ANALYSIS_CHARS } from '../utils/analysis-utils';

/**
 * Controller for PDF analysis — uses multer memory storage (no disk path issues)
 */
export const handlePdfAnalysis = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
    }

    console.log(`[ANALYSIS] File received: ${req.file.originalname}, size: ${req.file.size} bytes, mimetype: ${req.file.mimetype}`);

    try {
        // 1. Extract text from buffer directly (no disk path)
        console.log('[ANALYSIS] Step 1: Extracting text from buffer...');
        const buffer = req.file.buffer;

        if (!buffer || buffer.length === 0) {
            return res.status(400).json({ success: false, message: 'Uploaded file buffer is empty.' });
        }

        let text = await OCRService.extractText(buffer);
        console.log(`[ANALYSIS] Step 1 OK: ${text.length} characters extracted.`);

        // 2. Normalize & Clean
        console.log('[ANALYSIS] Step 2: Cleaning text...');
        text = cleanAndNormalizeText(text);

        if (!text || text.length < 50) {
            return res.status(422).json({
                success: false,
                message: 'This PDF seems to be empty or unreadable. Please make sure it contains clear text.',
            });
        }

        // 3. Truncate if too large
        let isTruncated = false;
        if (text.length > MAX_ANALYSIS_CHARS) {
            console.warn(`[ANALYSIS] Step 3: Truncating (${text.length} -> ${MAX_ANALYSIS_CHARS})`);
            text = text.substring(0, MAX_ANALYSIS_CHARS);
            isTruncated = true;
        }

        // 4. Chunk
        console.log('[ANALYSIS] Step 4: Chunking text...');
        const chunks = splitIntoChunks(text, 7000);
        const chunksToProcess = chunks.slice(0, 8);

        // 5. Analyze chunks
        console.log(`[ANALYSIS] Step 5: Processing ${chunksToProcess.length} chunks...`);
        const chunkResults = [];
        for (let i = 0; i < chunksToProcess.length; i++) {
            console.log(`[ANALYSIS] Chunk ${i + 1}/${chunksToProcess.length}...`);
            try {
                const result = await GroqAnalysisService.analyzeChunk(chunksToProcess[i]);
                if (result) chunkResults.push(result);
            } catch (chunkError: any) {
                console.error(`[ANALYSIS] Chunk ${i + 1} failed:`, chunkError.message);
                if (chunkResults.length === 0 && i === chunksToProcess.length - 1) throw chunkError;
            }
        }

        if (chunkResults.length === 0) {
            throw new Error('AI was unable to generate any insights. Try a different file.');
        }

        // 6. Merge
        console.log('[ANALYSIS] Step 6: Merging results...');
        const finalData = GroqAnalysisService.mergeResults(chunkResults);

        if (isTruncated) {
            finalData.summary += '\n\n(Note: Summary based on first part of large document.)';
        }

        console.log('[ANALYSIS] Step 7: Sending success response.');
        return res.status(200).json({
            success: true,
            summary: finalData.summary || 'Summary generation failed.',
            key_points: finalData.key_points || [],
            quiz: finalData.quiz || [],
            is_partial: isTruncated,
        });

    } catch (error: any) {
        console.error('!!! [FATAL PDF ANALYSIS ERROR] !!!', error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Internal Server Error during PDF analysis.',
        });
    }
    // No finally file cleanup needed — memory storage has no temp files
};
