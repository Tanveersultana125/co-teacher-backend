import dotenv from 'dotenv';
dotenv.config();
import './lib/firebase';
console.log('Firebase initialization module loaded');

import express from 'express';
import path from 'path';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import lessonRoutes from './routes/lesson.routes';
import attendanceRoutes from './routes/attendance.routes';
import curriculumRoutes from './routes/curriculum.routes';
import dashboardRoutes from './routes/dashboard.routes';
import assignmentRoutes from './routes/assignment.routes';
import quizRoutes from './routes/quiz.routes';
import materialRoutes from './routes/material.routes';
import messageRoutes from './routes/message.routes';
import examRoutes from './routes/exam.routes';
import uploadRoutes from './routes/upload.routes';
import studentDashboardRoutes from './routes/student_dashboard.routes';
import parentDashboardRoutes from './routes/parent_dashboard.routes';

import studentRoutes from './routes/student.routes';
import analysisRoutes from './routes/analysis.routes';
import pdfAnalysisRoutes from './routes/pdf-analysis.routes';
import { globalErrorHandler } from './middleware/error.middleware';

// Redundant call removed

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

console.log(`[INIT] Backend setting up with FRONTEND_URL: ${FRONTEND_URL}`);

app.use(cors({
    origin: true, // Allow all origins for debugging
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/student-dashboard', studentDashboardRoutes);
app.use('/api/parent-dashboard', parentDashboardRoutes);
app.use('/api/ai', analysisRoutes);
app.use('/api/analysis', pdfAnalysisRoutes);

// Production-Grade Global Error Handler
app.use(globalErrorHandler);

app.listen(PORT, () => {
    console.log(`Backend server is running on port ${PORT}`);
});
