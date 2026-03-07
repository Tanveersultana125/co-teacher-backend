
import { Request, Response } from 'express';
import { AIService } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';

export const analyzeData = async (req: AuthRequest, res: Response) => {
    try {
        const { csvData, analysisType } = req.body;

        console.log(`[Analysis] Analyzing data request received. Mode: ${analysisType}`);

        if (!csvData) {
            console.error('[Analysis] No CSV data provided in body.');
            return res.status(400).json({ error: 'CSV data is required' });
        }

        console.log(`[Analysis] CSV Data Length: ${csvData.length} chars`);
        const result = await AIService.generateDataAnalysis(csvData, analysisType || "General Analysis");

        res.json(result);
    } catch (error) {
        console.error("Analysis Error:", error);
        res.status(500).json({ error: 'Failed to analyze data', details: error instanceof Error ? error.message : String(error) });
    }
};
export const chatWithData = async (req: AuthRequest, res: Response) => {
    try {
        const { question, csvData } = req.body;

        if (!question || !csvData) {
            return res.status(400).json({ error: 'Question and CSV data are required' });
        }

        const answer = await AIService.chatWithData(question, csvData);
        res.json({ answer });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: 'Failed to process chat request' });
    }
};
