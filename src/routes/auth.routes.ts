import { Router } from 'express';
import { register, login, getMe, googleLogin } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';


const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/me', authenticate, getMe);

export default router;
