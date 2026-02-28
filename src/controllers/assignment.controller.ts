import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../lib/firebase';
import { AIService } from '../services/ai.service';
import { ImageService } from '../services/image.service';

export const generateAssignmentContent = async (req: AuthRequest, res: Response) => {
    let { topic, grade, subject, curriculum: board } = req.body;
    try {
        let tName = topic;
        let sName = subject;
        let finalTopicId = "";
        let finalSubjectId = "";

        // Dynamic Entity Resolution
        if (board && grade && subject && topic) {
            const curriculaRef = db.collection('curricula');
            const currSnapshot = await curriculaRef
                .where('board', '==', board)
                .where('grade', '==', parseInt(grade))
                .limit(1)
                .get();

            let currId;
            if (currSnapshot.empty) {
                const newCurr = await curriculaRef.add({ board, grade: parseInt(grade) });
                currId = newCurr.id;
            } else {
                currId = currSnapshot.docs[0].id;
            }

            const subjectsRef = db.collection('subjects');
            const subjSnapshot = await subjectsRef
                .where('name', '==', subject)
                .where('curriculumId', '==', currId)
                .limit(1)
                .get();

            let subjId;
            if (subjSnapshot.empty) {
                const newSubj = await subjectsRef.add({ name: subject, curriculumId: currId });
                subjId = newSubj.id;
            } else {
                subjId = subjSnapshot.docs[0].id;
            }
            finalSubjectId = subjId;

            const topicsRef = db.collection('topics');
            const topicSnapshot = await topicsRef
                .where('name', '==', topic)
                .where('subjectId', '==', subjId)
                .limit(1)
                .get();

            if (topicSnapshot.empty) {
                const newTopic = await topicsRef.add({ name: topic, subjectId: subjId });
                finalTopicId = newTopic.id;
            } else {
                finalTopicId = topicSnapshot.docs[0].id;
            }
        }

        const assignmentType = req.body.assignmentType || "Homework";
        const difficultyLevel = req.body.difficultyLevel || "Medium";
        const questionCount = req.body.questionCount || "5";

        const aiResponse = await AIService.generateAssignment(topic, grade, subject, assignmentType, difficultyLevel, questionCount);

        const teacherId = req.user?.id;
        if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });

        const { title: aiTitle, instructions: aiInstructions, answerKey: aiAnswerKey, ...contentRest } = aiResponse;

        const assignmentData: any = {
            title: aiTitle || `${assignmentType}: ${topic}`,
            description: aiInstructions?.[0] || `AI Generated ${assignmentType} on ${topic}`,
            instructions: aiInstructions || [],
            content: Object.keys(contentRest).length > 0 ? contentRest : aiResponse,
            answerKey: aiAnswerKey || aiResponse.answers || {},
            assignmentType: aiResponse.type || assignmentType,
            type: 'ASSIGNMENT',
            teacherId,
            grade: parseInt(grade) || 10,
            subjectId: finalSubjectId || '',
            topicId: finalTopicId || '',
            generatedImage: ImageService.generateDiagramUrl(tName),
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save to lessonPlans collection to appear in Library
        const docRef = await db.collection('lessonPlans').add(assignmentData);

        res.json({
            id: docRef.id,
            ...assignmentData,
            topicName: tName,
            subjectName: sName
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate assignment' });
    }
};

export const getAssignments = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = req.user?.id;
        console.log(`[Assignments] Fetching assignments for teacher: ${teacherId}`);

        // Fetch manual assignments
        const manualSnapshot = await db.collection('assignments')
            .where('teacherId', '==', teacherId)
            .get();

        // Fetch AI generated assignments (stored as lessonPlans)
        // Note: Using two where clauses on different fields REQUIRES a composite index
        // To avoid 500 errors if the index is missing, we fetch and filter in memory
        const aiSnapshot = await db.collection('lessonPlans')
            .where('teacherId', '==', teacherId)
            // .where('type', '==', 'ASSIGNMENT') // Moved to memory filter below
            .get();

        const manualAssignments = await Promise.all(manualSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            let subjectData = null;
            if (data.subjectId) {
                try {
                    const subjectDoc = await db.collection('subjects').doc(data.subjectId).get();
                    if (subjectDoc.exists) subjectData = { id: subjectDoc.id, ...subjectDoc.data() };
                } catch (e) { }
            }

            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt,
                source: 'MANUAL',
                subject: subjectData,
                submissions: []
            };
        }));

        const aiAssignments = await Promise.all(aiSnapshot.docs
            .filter(doc => doc.data().type === 'ASSIGNMENT') // Memory filter to avoid composite index
            .map(async (doc) => {
                const data = doc.data();
                let subjectData = null;
                if (data.subjectId) {
                    try {
                        const subjectDoc = await db.collection('subjects').doc(data.subjectId).get();
                        if (subjectDoc.exists) subjectData = { id: subjectDoc.id, ...subjectDoc.data() };
                    } catch (e) { }
                }

                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt,
                    source: 'AI',
                    subject: subjectData || { name: data.subjectName || 'General' },
                    description: data.description || "AI Generated Assignment",
                    dueDate: data.dueDate || new Date().toISOString(),
                    submissions: []
                };
            }));

        // Combine and Sort
        const allAssignments = [...manualAssignments, ...aiAssignments].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
        });

        res.json(allAssignments);
    } catch (error: any) {
        console.error(`[Assignments] ERROR:`, error.message);
        res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
    }
};

export const createAssignment = async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, subjectId: paramSubjectId, classId, dueDate, fileUrl, subject, grade, maxScore } = req.body;
        const teacherId = req.user!.id;

        let finalSubjectId = paramSubjectId;

        // Logical Subject Resolution for Manual Entry
        if (!finalSubjectId && subject) {
            const subjectsRef = db.collection('subjects');
            // Try to find existing subject for this teacher or generic
            // For simplicity, we'll check if we can find one for this teacher or create it
            // Ideally should be linked to a curriculum, but for manual entry we can contain it

            // Note: This is a simplified check. In production, we might want to link to Board/Grade.
            const subjSnapshot = await subjectsRef
                .where('name', '==', subject)
                // .where('teacherId', '==', teacherId) // Optional: Scope to teacher if subjects are private
                .limit(1)
                .get();

            if (!subjSnapshot.empty) {
                finalSubjectId = subjSnapshot.docs[0].id;
            } else {
                // Create new Ad-hoc Subject
                const newSubj = await subjectsRef.add({
                    name: subject,
                    teacherId,
                    isAdHoc: true,
                    createdAt: new Date().toISOString()
                });
                finalSubjectId = newSubj.id;
            }
        }

        const assignmentData = {
            title,
            description,
            subjectId: finalSubjectId || null,
            subjectName: subject || null, // Store name as fallback
            classId: classId || null,
            grade: grade ? parseInt(grade.toString()) : null,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
            maxScore: maxScore ? parseInt(maxScore.toString()) : 100,
            fileUrl: fileUrl || null,
            teacherId,
            type: 'ASSIGNMENT', // Standardize type
            source: 'MANUAL',
            status: 'PUBLISHED', // Manual entries are usually ready
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('assignments').add(assignmentData);

        res.status(201).json({ id: docRef.id, ...assignmentData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create assignment' });
    }
};

export const getSubmissions = async (req: AuthRequest, res: Response) => {
    const { assignmentId } = req.params;
    try {
        const snapshot = await db.collection('submissions')
            .where('assignmentId', '==', assignmentId as string)
            .get();

        const submissions = await Promise.all(snapshot.docs.map(async (doc) => {
            const data = doc.data();
            const studentDoc = await db.collection('students').doc(data.studentId).get();
            const studentData = studentDoc.data();
            let userData = {};
            if (studentData?.userId) {
                const userDoc = await db.collection('users').doc(studentData.userId).get();
                userData = userDoc.data() || {};
            }
            return {
                id: doc.id,
                ...data,
                student: {
                    id: studentDoc.id,
                    ...studentData,
                    user: userData
                }
            };
        }));

        res.json(submissions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
};

export const gradeSubmission = async (req: AuthRequest, res: Response) => {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;
    try {
        const submissionRef = db.collection('submissions').doc(submissionId as string);
        const subDoc = await submissionRef.get();
        if (!subDoc.exists) return res.status(404).json({ error: 'Submission not found' });

        const submissionData = subDoc.data();
        await submissionRef.update({
            grade: parseFloat(grade),
            feedback,
            updatedAt: new Date().toISOString()
        });

        // AssessmentGrade logic
        const gradeId = `grade-${submissionId}`;
        const assessmentGradeRef = db.collection('assessmentGrades').doc(gradeId);

        await assessmentGradeRef.set({
            studentId: submissionData?.studentId,
            type: 'ASSIGNMENT',
            referenceId: submissionData?.assignmentId,
            score: parseFloat(grade),
            maxScore: 100,
            gradedAt: new Date().toISOString()
        }, { merge: true });

        res.json({ id: submissionId, ...submissionData, grade: parseFloat(grade), feedback });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to grade submission' });
    }
};
