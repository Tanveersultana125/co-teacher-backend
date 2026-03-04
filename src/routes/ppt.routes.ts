import express from 'express';
import { generatePPTFile } from '../controllers/ppt.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/generate-ppt', authenticate, generatePPTFile);

export default router;
