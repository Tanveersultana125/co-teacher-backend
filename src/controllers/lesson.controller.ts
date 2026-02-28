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
            // @ts-ignore
            materials: finalContent.materials || [],
            // @ts-ignore
            pedagogy: finalContent.pedagogy || "",
            // @ts-ignore
            inquiryBasedLearning: finalContent.inquiryBasedLearning || "",
            // @ts-ignore
            differentiation: finalContent.differentiation || null,
            generatedImage: diagramUrl,
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const lessonRef = await db.collection('lessonPlans').add(lessonData);

        res.status(201).json({
            id: lessonRef.id,
            ...lessonData,
            explanation: (finalContent as any).explanation,
            questions: (finalContent as any).questions
        });
    } catch (error) {
        console.error("Create Lesson Error:", error);
        res.status(500).json({ error: 'Failed to create lesson plan', details: error instanceof Error ? error.message : String(error) });
    }
};

export const getLessons = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = req.user?.id;
        if (!teacherId) {
            console.warn("[Lessons] No teacherId in request, returning empty list");
            return res.json([]);
        }

        const { limit } = req.query;
        let query: any = db.collection('lessonPlans')
            .where('teacherId', '==', teacherId);

        if (limit) {
            query = query.limit(Number(limit));
        }

        const snapshot = await query.get();

        const lessons = await Promise.all(snapshot.docs.map(async (doc: any) => {
            const data = doc.data() || {};

            let subjData = null;
            let topicData = null;

            try {
                const [subjDoc, topicDoc] = await Promise.all([
                    data.subjectId && typeof data.subjectId === 'string' ? db.collection('subjects').doc(data.subjectId).get() : Promise.resolve(null),
                    data.topicId && typeof data.topicId === 'string' ? db.collection('topics').doc(data.topicId).get() : Promise.resolve(null)
                ]);

                if (subjDoc?.exists) subjData = { id: subjDoc.id, ...subjDoc.data() };
                if (topicDoc?.exists) topicData = { id: topicDoc.id, ...topicDoc.data() };
            } catch (err) {
                console.warn(`[Lessons] Failed to fetch relations for lesson ${doc.id}`);
            }

            return {
                id: doc.id,
                ...data,
                subject: subjData,
                topic: topicData
            };
        }));

        // Sort manually by updatedAt desc, safe with missing dates
        lessons.sort((a, b) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateB - dateA;
        });

        res.json(lessons);
    } catch (error) {
        console.error("Get Lessons Error:", error);
        res.status(500).json({ error: 'Failed to fetch lessons' });
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
        const { topic, grade, curriculum, slides } = req.body;
        if (!topic) return res.status(400).json({ error: "Topic is required" });

        const slideData = await AIService.generatePresentation(topic, grade || "10", curriculum || "CBSE", Number(slides) || 5);
        res.json(slideData);
    } catch (error) {
        console.error("Presentation Generation Error:", error);
        res.status(500).json({ error: "Failed to generate presentation" });
    }
};
