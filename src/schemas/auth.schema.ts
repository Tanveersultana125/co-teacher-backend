import { z } from 'zod';

export const registerSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        name: z.string().min(2, "Name must be at least 2 characters"),
        role: z.enum(['TEACHER', 'STUDENT', 'PARENT']).optional(),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address"),
        password: z.string().min(1, "Password is required"),
    }),
});

export const lessonSchema = z.object({
    body: z.object({
        title: z.string().optional().or(z.literal("")),
        grade: z.string().min(1, "Grade is required"),
        curriculum: z.string().optional(),
        subject: z.string().optional(),
        topic: z.string().optional(),
        objective: z.any().optional(),
        duration: z.string().optional(),
        numSessions: z.string().optional(),
        activities: z.any().optional(),
        homework: z.any().optional(),
        resources: z.any().optional(),
        aiAssist: z.boolean().optional(),
    }),
});
