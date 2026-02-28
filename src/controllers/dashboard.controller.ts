import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../lib/firebase';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    const start = Date.now();
    try {
        const teacherId = req.user!.id;
        console.log(`[Dashboard] Fetching stats for teacher: ${teacherId}`);

        // Individual try-catches to identify which collection fails
        let studentsCount = 0;
        let lessonsCount = 0;
        let presentCount = 0;
        let attendanceTotal = 0;

        try {
            const studentsSnap = await db.collection('students').get();
            studentsCount = studentsSnap.size;
        } catch (e: any) { console.error("[Dashboard] Students fetch failed:", e.message); }

        try {
            const lessonsSnap = await db.collection('lessonPlans').where('teacherId', '==', teacherId).get();
            lessonsCount = lessonsSnap.size;
        } catch (e: any) { console.error("[Dashboard] Lessons fetch failed:", e.message); }

        try {
            const attendanceSnap = await db.collection('attendance')
                .where('teacherId', '==', teacherId)
                .limit(100)
                .get();

            const attendanceRecords = attendanceSnap.docs.map(doc => doc.data());
            presentCount = attendanceRecords.filter(r => r.status === 'PRESENT').length;
            attendanceTotal = attendanceRecords.length;
        } catch (e: any) { console.error("[Dashboard] Attendance fetch failed:", e.message); }

        const attendanceRate = attendanceTotal > 0 ? (presentCount / attendanceTotal) * 100 : 95;

        console.log(`[Dashboard] Sending response for teacher: ${teacherId}`);
        res.json({
            totalStudents: studentsCount,
            lessonsCreated: lessonsCount,
            avgPerformance: 78,
            classesToday: 4,
            attendanceRate: Math.round(attendanceRate),
            pendingAssignments: 5
        });
    } catch (error: any) {
        console.error(`[Dashboard] Global Error (took ${Date.now() - start}ms):`, error.message);
        res.json({
            totalStudents: 0,
            lessonsCreated: 0,
            avgPerformance: 78,
            classesToday: 0,
            attendanceRate: 95,
            pendingAssignments: 0
        });
    }
};
