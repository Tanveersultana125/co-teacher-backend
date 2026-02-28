import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, auth } from '../lib/firebase';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, name, role } = req.body;

        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();

        if (!snapshot.empty) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            email,
            name,
            password: hashedPassword,
            role: role || 'TEACHER',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await usersRef.add(newUser);
        const userId = docRef.id;

        const token = jwt.sign({ id: userId, email, role: newUser.role }, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({
            token,
            user: { id: userId, email, name, role: newUser.role }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response) => {
    console.log(`[Auth] Login request received for email: ${req.body.email}`);
    try {
        const { email, password } = req.body;

        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();

        if (snapshot.empty) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        const isPasswordValid = await bcrypt.compare(password, userData.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: userDoc.id, email: userData.email, role: userData.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: { id: userDoc.id, email: userData.email, name: userData.name, role: userData.role }
        });
    } catch (error) {
        console.error("[Auth] Login error:", error);
        res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
    }
};

export const googleLogin = async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;
        // Verify the ID token using Firebase Admin SDK
        const decodedToken = await auth.verifyIdToken(idToken);
        const { email, name, uid, picture } = decodedToken;

        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();

        let userData;
        let userId;

        if (snapshot.empty) {
            // Register new user from Google info
            const newUser = {
                email,
                name: name || email?.split('@')[0],
                role: 'TEACHER', // Default role
                picture,
                googleUid: uid,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const docRef = await usersRef.add(newUser);
            userId = docRef.id;
            userData = newUser;
        } else {
            const userDoc = snapshot.docs[0];
            userId = userDoc.id;
            userData = userDoc.data();
        }

        const token = jwt.sign(
            { id: userId, email: userData.email, role: userData.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: { id: userId, email: userData.email, name: userData.name, role: userData.role }
        });
    } catch (error) {
        console.error("Google verify error:", error);
        res.status(401).json({ error: 'Invalid Google token' });
    }
};

export const getMe = async (req: any, res: Response) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.id).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        res.json({ id: userDoc.id, email: userData?.email, name: userData?.name, role: userData?.role });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
