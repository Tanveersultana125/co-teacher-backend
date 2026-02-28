import { Router } from 'express';
import { getLessons, getLesson, createLesson, updateLesson, deleteLesson, summarizeLesson, summarizeLessonPdf, extractVocabulary, generateMiniQuiz, generatePresentation } from '../controllers/lesson.controller';
import { optionalAuthenticate, authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.get('/', authenticate, getLessons);
router.get('/:id', authenticate, getLesson);
router.post('/', authenticate, createLesson);
router.put('/:id', authenticate, updateLesson);
router.patch('/:id', authenticate, updateLesson);
router.delete('/:id', authenticate, deleteLesson);
router.post('/summarize', authenticate, summarizeLesson);
router.post('/summarize-pdf', authenticate, upload.single('file'), summarizeLessonPdf);
router.post('/vocab', authenticate, extractVocabulary);
router.post('/quiz', authenticate, generateMiniQuiz);
router.post('/generate-ppt', authenticate, generatePresentation);

export default router;
