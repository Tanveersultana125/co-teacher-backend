import { Router } from 'express';
import { register, login, getMe, googleLogin } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';


const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/google', googleLogin);
router.get('/me', authenticate, getMe);

export default router;
