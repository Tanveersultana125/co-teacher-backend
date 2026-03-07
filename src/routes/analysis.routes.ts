
import express from 'express';
import { analyzeData, chatWithData } from '../controllers/analysis.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/analyze-data', authenticate, analyzeData);
router.post('/chat-data', authenticate, chatWithData);

export default router;

