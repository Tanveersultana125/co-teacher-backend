import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../lib/firebase';
import { AIService } from '../services/ai.service';
import { ImageService } from '../services/image.service';

export const generateQuizAI = async (req: AuthRequest, res: Response) => {
    let { topicId, count, grade, subjectId, curriculum: board, subject: subjectName, topic: topicName } = req.body;
    try {
        let tName = topicName;
        let sName = subjectName;
        let finalTopicId = topicId;

        // Dynamic Entity Resolution
        if (board && grade && subjectName && topicName) {
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
                .where('name', '==', subjectName)
                .where('curriculumId', '==', currId)
                .limit(1)
                .get();

            let subjId;
            if (subjSnapshot.empty) {
                const newSubj = await subjectsRef.add({ name: subjectName, curriculumId: currId });
                subjId = newSubj.id;
            } else {
                subjId = subjSnapshot.docs[0].id;
            }

            const topicsRef = db.collection('topics');
            const topicSnapshot = await topicsRef
                .where('name', '==', topicName)
                .where('subjectId', '==', subjId)
                .limit(1)
                .get();

            if (topicSnapshot.empty) {
                const newTopic = await topicsRef.add({ name: topicName, subjectId: subjId });
                finalTopicId = newTopic.id;
            } else {
                finalTopicId = topicSnapshot.docs[0].id;
            }
        } else if (topicId) {
            const topicDoc = await db.collection('topics').doc(topicId).get();
            if (!topicDoc.exists) return res.status(404).json({ error: 'Topic not found' });
            tName = topicDoc.data()?.name;
        }

        if (!tName) {
            if (req.body.pdfText) {
                tName = "Context from PDF";
                sName = sName || "General";
            } else {
                return res.status(400).json({ error: 'Topic name is required' });
            }
        }

        const gradeVal = grade || "10";
        const finalSubjectName = sName || "General";
        const qType = req.body.questionType || "MCQ";
        const bLevel = req.body.bloomLevel || "Mixed";
        const count = req.body.count || 5;

        const language = req.body.language || "auto";
        const aiResponse = await AIService.generateQuiz(tName, gradeVal, finalSubjectName, qType, bLevel, count, language);

        const teacherId = req.user?.id;
        if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });

        const quizData: any = {
            title: req.body.quizTitle || aiResponse.title || `Quiz: ${tName}`,
            questions: aiResponse.questions,
            type: 'QUIZ',
            teacherId,
            grade: parseInt(grade) || 10,
            subjectId: subjectId || '',
            topicId: finalTopicId || '',
            generatedImage: ImageService.generateDiagramUrl(tName),
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const quizRef = await db.collection('lessonPlans').add(quizData);

        res.json({
            id: quizRef.id,
            ...quizData,
            topicName: tName,
            subjectName: sName
        });
    } catch (error) {
        console.error("Quiz Generation Error:", error);
        res.status(500).json({ error: 'Failed to generate quiz' });
    }
};

export const saveQuiz = async (req: AuthRequest, res: Response) => {
    const { title, topicId, questions } = req.body;
    try {
        const quizData = {
            title,
            topicId: topicId || '',
            questions,
            createdAt: new Date().toISOString()
        };
        const quizRef = await db.collection('quizzes').add(quizData);
        res.status(201).json({ id: quizRef.id, ...quizData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save quiz' });
    }
};

export const getQuizzes = async (req: AuthRequest, res: Response) => {
    try {
        const snapshot = await db.collection('quizzes').orderBy('createdAt', 'desc').get();
        const quizzes = await Promise.all(snapshot.docs.map(async (doc) => {
            const data = doc.data();
            let topicData = null;
            if (data.topicId) {
                const topicDoc = await db.collection('topics').doc(data.topicId).get();
                if (topicDoc.exists) {
                    topicData = { id: topicDoc.id, ...topicDoc.data() };
                    // Optionally fetch subject/curriculum details here if needed
                }
            }
            return { id: doc.id, ...data, topic: topicData };
        }));
        res.json(quizzes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
};
