import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../lib/firebase';
import { AIService } from '../services/ai.service';
import { ImageService } from '../services/image.service';
import * as fs from 'fs';
// pdf-parse v1.1.1 — simple async function: pdf(buffer) => { text, numpages, ... }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export const createLesson = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = req.user?.id;
        if (!teacherId) {
            return res.status(401).json({ error: "Unauthorized: No user session found." });
        }

        console.log("Create Lesson Payload:", JSON.stringify(req.body, null, 2));
        let { title, subjectId, topicId, grade, objective, duration, activities, homework, resources, aiAssist, curriculum: board, subject: subjectName, topic: topicName, pdfText, unitDetails, numSessions } = req.body;

        let finalContent = { objective, activities, homework, resources, teachingStrategies: [], assessmentMethods: [], estimatedTime: [], referenceUrl: null, motivationalQuote: "" };
        let finalSubjectId = subjectId;
        let finalTopicId = topicId;

        // --- DYNAMIC ENTITY RESOLUTION (Firestore Version) ---
        if (board && grade && subjectName && topicName) {
            console.log(`Resolving entities for Board: ${board}, Grade: ${grade}, Subject: ${subjectName}, Topic: ${topicName}`);
            const gradeNum = parseInt(grade);

            // 1. Resolve/Create Curriculum
            const curriculaRef = db.collection('curricula');
            const currSnapshot = await curriculaRef
                .where('board', '==', board)
                .get();

            let currDoc = currSnapshot.docs.find(d => d.data().grade === gradeNum);
            let currId;

            if (!currDoc) {
                const newCurr = await curriculaRef.add({ board, grade: gradeNum });
                currId = newCurr.id;
            } else {
                currId = currDoc.id;
            }

            // 2. Resolve/Create Subject
            const subjectsRef = db.collection('subjects');
            const subjSnapshot = await subjectsRef
                .where('name', '==', subjectName)
                .get();

            let subjDoc = subjSnapshot.docs.find(d => d.data().curriculumId === currId);

            if (!subjDoc) {
                const newSubj = await subjectsRef.add({ name: subjectName, curriculumId: currId });
                finalSubjectId = newSubj.id;
            } else {
                finalSubjectId = subjDoc.id;
            }

            // 3. Resolve/Create Topic
            const topicsRef = db.collection('topics');
            const topicSnapshot = await topicsRef
                .where('name', '==', topicName)
                .get();

            let topicDoc = topicSnapshot.docs.find(d => d.data().subjectId === finalSubjectId);

            if (!topicDoc) {
                const newTopic = await topicsRef.add({ name: topicName, subjectId: finalSubjectId });
                finalTopicId = newTopic.id;
            } else {
                finalTopicId = topicDoc.id;
            }
        }

        // --- AI GENERATION ---
        if (aiAssist || (board && grade)) {
            let sName = subjectName;
            let tName = topicName;

            if (!sName && finalSubjectId) {
                const sDoc = await db.collection('subjects').doc(finalSubjectId).get();
                sName = sDoc.data()?.name;
            }
            if (!tName && finalTopicId) {
                const tDoc = await db.collection('topics').doc(finalTopicId).get();
                tName = tDoc.data()?.name;
            }

            if (!tName || !sName) {
                return res.status(400).json({ error: 'Invalid Subject or Topic context' });
            }

            console.log("Calling AI Service...");
            const aiData = await AIService.generateLessonPlan(tName, grade || "10", sName, pdfText, unitDetails, duration, numSessions, board || "Standard");

            const searchQuery = aiData.videoSearchQuery || tName;
            const finalQuery = searchQuery.toLowerCase().includes(tName.toLowerCase())
                ? searchQuery
                : `${tName} ${searchQuery}`;

            finalContent = {
                objective: aiData.objective,
                activities: JSON.stringify(aiData.activities),
                homework: aiData.homework,
                resources: Array.isArray(aiData.resources) ? aiData.resources.join(', ') : aiData.resources,
                // @ts-ignore
                explanation: aiData.explanation,
                // @ts-ignore
                questions: aiData.questions,
                // @ts-ignore
                teachingStrategies: aiData.teachingStrategies,
                // @ts-ignore
                assessmentMethods: aiData.assessmentMethods,
                // @ts-ignore
                estimatedTime: aiData.estimatedTime,
                // @ts-ignore
                referenceUrl: {
                    title: `Search on YouTube`,
                    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(finalQuery)}`
                },
                // @ts-ignore
                motivationalQuote: aiData.motivationalQuote,
                // @ts-ignore
                materials: aiData.materials,
                // @ts-ignore
                pedagogy: aiData.pedagogy,
                // @ts-ignore
                inquiryBasedLearning: aiData.inquiryBasedLearning,
                // @ts-ignore
                differentiation: aiData.differentiation
            };
        }


        // Generate dynamic diagram
        const diagramUrl = ImageService.generateDiagramUrl(topicName || title || "educational diagram");

        const lessonData: any = {
            title: title || `Lesson: ${topicName || 'Generated'}`,
            teacherId: teacherId,
            subjectId: finalSubjectId || '',
            topicId: finalTopicId || '',
            objective: finalContent.objective,
            duration: parseInt(duration) || 45,
            activities: typeof finalContent.activities === 'string' ? finalContent.activities : JSON.stringify(finalContent.activities),
            homework: finalContent.homework || '',
            resources: finalContent.resources || '',
            teachingStrategies: finalContent.teachingStrategies || [],
            assessmentMethods: finalContent.assessmentMethods || [],
            estimatedTime: finalContent.estimatedTime || [],
            referenceUrl: finalContent.referenceUrl || null,
            motivationalQuote: finalContent.motivationalQuote || "",
            explanation: (finalContent as any).explanation || "",
            questions: (finalContent as any).questions || [],
            materials: (finalContent as any).materials || [],
            pedagogy: (finalContent as any).pedagogy || "",
            inquiryBasedLearning: (finalContent as any).inquiryBasedLearning || "",
            differentiation: (finalContent as any).differentiation || null,
            groupSize: (finalContent as any).groupSize || "",
            standardsAlignment: (finalContent as any).standardsAlignment || "",
            closure: (finalContent as any).closure || "",
            assessment: (finalContent as any).assessment || null,
            generatedImage: diagramUrl,
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const lessonRef = await db.collection('lessonPlans').add(lessonData);

        res.status(201).json({
            id: lessonRef.id,
            ...lessonData
        });
    } catch (error) {
        console.error("Create Lesson Error:", error);
        res.status(500).json({ error: 'Failed to create lesson plan', details: error instanceof Error ? error.message : String(error) });
    }
};

export const getLesson = async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    try {
        const lessonDoc = await db.collection('lessonPlans').doc(id).get();
        if (!lessonDoc.exists) {
            return res.status(404).json({ error: 'Lesson not found' });
        }
        const data = lessonDoc.data();
        if (data?.teacherId !== req.user?.id) {
            // Optional: for shared/published content, this check might be relaxed
            // return res.status(401).json({ error: 'Unauthorized' });
        }

        let subjData = null;
        let topicData = null;
        try {
            const [subjDoc, topicDoc] = await Promise.all([
                data?.subjectId ? db.collection('subjects').doc(data.subjectId).get() : Promise.resolve(null),
                data?.topicId ? db.collection('topics').doc(data.topicId).get() : Promise.resolve(null)
            ]);
            if (subjDoc?.exists) subjData = { id: subjDoc.id, ...subjDoc.data() };
            if (topicDoc?.exists) topicData = { id: topicDoc.id, ...topicDoc.data() };
        } catch (e) { }

        res.json({ id, ...data, subject: subjData, topic: topicData });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch lesson' });
    }
};

export const getLessons = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = req.user?.id;
        if (!teacherId) {
            console.error("[Lessons] No teacherId in request");
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { type, limit: limitParam } = req.query;
        console.log(`[Lessons] Fetching lessons for teacher: ${teacherId}, type: ${type}, limit: ${limitParam}`);

        let query: any = db.collection('lessonPlans')
            .where('teacherId', '==', teacherId);

        if (type) {
            query = query.where('type', '==', type);
        }

        // Limit to prevent huge loads, default 50
        const limitCount = parseInt(limitParam as string) || 50;

        // Note: orderBy('createdAt', 'desc') requires a composite index with the where clause.
        // To avoid 500 errors if the index is missing, we fetch and sort in memory for now.
        // In production, you should create the index: teacherId (ASC) + createdAt (DESC)
        const snapshot = await query.get();

        const lessons = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        // In-memory sort
        lessons.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
        });

        const paginatedLessons = lessons.slice(0, limitCount);

        res.json(paginatedLessons);
    } catch (error: any) {
        console.error(`[Lessons] ERROR:`, error);
        if (error.message?.includes('index')) {
            console.error('[Lessons] CRITICAL: Firestore Index Missing. Please check Firebase console.');
        }
        res.status(500).json({ error: 'Failed to fetch lessons', details: error.message });
    }
};

export const updateLesson = async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    try {
        const lessonRef = db.collection('lessonPlans').doc(id);
        const doc = await lessonRef.get();

        if (!doc.exists || doc.data()?.teacherId !== req.user?.id) {
            return res.status(404).json({ error: 'Lesson not found' });
        }

        await lessonRef.update({
            ...req.body,
            updatedAt: new Date().toISOString()
        });

        res.json({ id, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
};

export const deleteLesson = async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    try {
        const lessonRef = db.collection('lessonPlans').doc(id);
        const doc = await lessonRef.get();

        if (!doc.exists || doc.data()?.teacherId !== req.user?.id) {
            return res.status(404).json({ error: 'Lesson not found' });
        }

        await lessonRef.delete();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
};


export const summarizeLesson = async (req: AuthRequest, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'No text provided' });

        const summary = await AIService.summarizeContent(text);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Summarization failed' });
    }
};

export const summarizeLessonPdf = async (req: AuthRequest, res: Response) => {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: "No PDF file uploaded" });
    }

    try {
        console.log("Processing PDF:", file.originalname);
        const dataBuffer = fs.readFileSync(file.path);
        console.log(`Buffer size: ${dataBuffer.length} bytes`);

        // pdf-parse v1.1.1 — simple function call: pdfParse(buffer) => { text, numpages }
        let text = "";
        try {
            console.log("Extracting text from PDF using pdf-parse v1...");
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text || "";
            console.log(`Extraction successful. Pages: ${pdfData.numpages}, Characters: ${text.length}`);
        } catch (pdfError: any) {
            console.error("pdf-parse Error Details:", pdfError.message);
            return res.status(422).json({
                error: 'Failed to read PDF structure',
                details: pdfError.message || 'The PDF might be corrupted, encrypted, or password-protected.',
            });
        }

        let summary;
        if (!text || text.trim().length < 20) {
            console.warn("PDF extraction returned little/no text. Using Gemini Multimodal for scanned PDF...");
            summary = await AIService.summarizeScannedPdf(dataBuffer);
        } else {
            console.log(`Summarizing extracted text (${text.length} chars)...`);
            summary = await AIService.summarizeContent(text);
        }
        console.log("Summary generated successfully.");
        res.json(summary);
    } catch (error: any) {
        console.error("PDF Summarization Global Error:", error);
        res.status(500).json({
            error: 'PDF processing failed',
            details: error instanceof Error ? error.message : String(error),
            step: "Global Catch"
        });
    } finally {
        // Always clean up the uploaded file
        if (file && file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
                console.log("Cleaned up file:", file.filename);
            } catch (cleanupError) {
                console.error("Failed to delete temp file:", cleanupError);
            }
        }
    }
};

export const extractVocabulary = async (req: AuthRequest, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'No text provided' });

        const vocabulary = await AIService.extractVocabulary(text);
        res.json(vocabulary);
    } catch (error) {
        res.status(500).json({ error: 'Vocabulary extraction failed' });
    }
};

export const generateMiniQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'No text provided' });

        const quiz = await AIService.generateMiniQuiz(text);
        res.json(quiz);
    } catch (error) {
        res.status(500).json({ error: 'Quiz generation failed' });
    }
};

export const generatePresentation = async (req: AuthRequest, res: Response) => {
    try {
        const { topic, grade, curriculum, slides, subject: subjectName } = req.body;
        if (!topic) return res.status(400).json({ error: "Topic is required" });

        let finalTopicId = "";
        let finalSubjectId = "";

        // Resolve Entities
        if (curriculum && grade && subjectName && topic) {
            const curriculaRef = db.collection('curricula');
            const currSnapshot = await curriculaRef
                .where('board', '==', curriculum)
                .where('grade', '==', parseInt(grade))
                .limit(1)
                .get();

            let currId;
            if (currSnapshot.empty) {
                const newCurr = await curriculaRef.add({ board: curriculum, grade: parseInt(grade) });
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

            if (subjSnapshot.empty) {
                const newSubj = await subjectsRef.add({ name: subjectName, curriculumId: currId });
                finalSubjectId = newSubj.id;
            } else {
                finalSubjectId = subjSnapshot.docs[0].id;
            }

            const topicsRef = db.collection('topics');
            const topicSnapshot = await topicsRef
                .where('name', '==', topic)
                .where('subjectId', '==', finalSubjectId)
                .limit(1)
                .get();

            if (topicSnapshot.empty) {
                const newTopic = await topicsRef.add({ name: topic, subjectId: finalSubjectId });
                finalTopicId = newTopic.id;
            } else {
                finalTopicId = topicSnapshot.docs[0].id;
            }
        }

        const slideData = await AIService.generatePresentation(topic, grade || "10", curriculum || "CBSE", Number(slides) || 5);

        const teacherId = req.user?.id;
        if (teacherId) {
            const pptData = {
                title: `${topic} Presentation`,
                content: { slides: slideData },
                type: 'PRESENTATION',
                teacherId,
                grade: parseInt(grade) || 10,
                subjectId: finalSubjectId || '',
                topicId: finalTopicId || '',
                status: 'DRAFT',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await db.collection('lessonPlans').add(pptData);
        }

        res.json(slideData);
    } catch (error) {
        console.error("Presentation Generation Error:", error);
        res.status(500).json({ error: "Failed to generate presentation" });
    }
};
