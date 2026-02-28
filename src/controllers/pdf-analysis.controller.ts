
import { Request, Response, NextFunction } from 'express';
import { OCRService } from '../services/analysis-ocr.service';
import { GroqAnalysisService } from '../services/groq-analysis.service';
import { cleanAndNormalizeText, splitIntoChunks, MAX_ANALYSIS_CHARS } from '../utils/analysis-utils';
import * as fs from 'fs';

/**
 * Controller for crash-proof PDF analysis
 */
export const handlePdfAnalysis = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No PDF file uploaded." });
    }

    const filePath = req.file.path;

    try {
        // 1. Extract
        console.log("[ANALYSIS] Step 1: Extracting text from PDF...");
        let text = await OCRService.extractText(filePath);
        console.log(`[ANALYSIS] Step 1 OK: Initial extraction: ${text.length} characters.`);

        // 2. Normalize & Clean
        console.log("[ANALYSIS] Step 2: Cleaning text...");
        text = cleanAndNormalizeText(text);

        if (!text || text.length < 50) {
            console.error("[ANALYSIS] Step 2 FAIL: Document empty.");
            throw new Error("This PDF seems to be empty or unreadable. Please make sure it contains clear text or images.");
        }

        // 3. Smart Truncate
        let isTruncated = false;
        if (text.length > MAX_ANALYSIS_CHARS) {
            console.warn(`[ANALYSIS] Step 3: Truncating text (${text.length} -> ${MAX_ANALYSIS_CHARS})`);
            text = text.substring(0, MAX_ANALYSIS_CHARS);
            isTruncated = true;
        }

        // 4. Chunk
        console.log("[ANALYSIS] Step 4: Chunking text...");
        const chunks = splitIntoChunks(text, 7000);
        const maxChunks = 8;
        const chunksToProcess = chunks.slice(0, maxChunks);

        // 5. Analyze Sequentially
        console.log(`[ANALYSIS] Step 5: Processing ${chunksToProcess.length} chunks on Groq...`);
        const chunkResults = [];
        for (let i = 0; i < chunksToProcess.length; i++) {
            console.log(`[ANALYSIS] Analyzing chunk ${i + 1}/${chunksToProcess.length}...`);
            try {
                const result = await GroqAnalysisService.analyzeChunk(chunksToProcess[i]);
                if (result) chunkResults.push(result);
            } catch (chunkError: any) {
                console.error(`[ANALYSIS] Chunk ${i + 1} failed:`, chunkError.message);
                if (chunkResults.length === 0 && i === chunksToProcess.length - 1) throw chunkError;
            }
        }

        if (chunkResults.length === 0) {
            throw new Error("AI was unable to generate any insights. Try a different file.");
        }

        // 6. Merge
        console.log("[ANALYSIS] Step 6: Merging and finalizing...");
        const finalData = GroqAnalysisService.mergeResults(chunkResults);

        if (isTruncated) {
            finalData.summary = finalData.summary + "\n\n(Note: Summary based on first part of large document.)";
        }

        // 7. Structured Flat Response
        console.log("[ANALYSIS] Step 7: Sending success response.");
        return res.status(200).json({
            success: true,
            summary: finalData.summary || "Summary generation failed.",
            key_points: finalData.key_points || [],
            quiz: finalData.quiz || [],
            is_partial: isTruncated
        });

    } catch (error: any) {
        console.error("!!! [FATAL PDF ANALYSIS ERROR] !!!");
        console.error(error); // This prints the full stack trace

        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal Server Error during PDF analysis.",
            debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log("[ANALYSIS] Final Cleanup: Temp file deleted.");
            } catch (err) {
                console.error("[ANALYSIS] Final Cleanup failed:", err);
            }
        }
    }
};
