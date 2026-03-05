import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../lib/firebase';
import { AIService } from '../services/ai.service';
import { ImageService } from '../services/image.service';

export const generateMaterial = async (req: AuthRequest, res: Response) => {
    let { type, topicId, curriculum: board, grade, subject: subjectName, topic: topicName } = req.body;
    try {
        let finalTopicId = topicId;
        let subjId = '';
        let tName = topicName;
        let sName = subjectName;

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

            if (subjSnapshot.empty) {
                const newSubj = await subjectsRef.add({ name: subjectName, curriculumId: currId });
                subjId = newSubj.id;
            } else {
                subjId = subjSnapshot.docs[0].id;
                sName = subjectName;
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

            const topicData = topicDoc.data();
            tName = topicData?.name;

            if (topicData?.subjectId) {
                const subjDoc = await db.collection('subjects').doc(topicData.subjectId).get();
                sName = subjDoc.data()?.name;
            }
        }

        if (!tName) {
            if (req.body.pdfText) {
                tName = "Context from PDF";
                sName = sName || "General";
            } else {
                return res.status(400).json({ error: 'Topic name is required' });
            }
        }

        const aiData = await AIService.generateMaterial(tName, type, grade, sName);

        const teacherId = req.user?.id;
        if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });

        // Merge AI structured data with existing metadata
        const materialData: any = {
            ...aiData, // Spread structured fields: chapterNumber, intro, sections, etc.
            title: aiData.title || `${type}: ${tName}`,
            type: 'MATERIAL',
            subType: type,
            teacherId,
            grade: parseInt(grade) || 10,
            subjectId: subjId || '',
            topicId: finalTopicId || '',
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Generate dynamic diagram if illustration description exists
        if (aiData.illustrationDescription) {
            materialData.generatedImage = ImageService.generateDiagramUrl(aiData.illustrationDescription);
        } else {
            materialData.generatedImage = ImageService.generateDiagramUrl(tName);
        }

        const materialRef = await db.collection('lessonPlans').add(materialData);

        res.json({
            id: materialRef.id,
            ...materialData,
            topicName: tName,
            subjectName: sName
        });
    } catch (error) {
        console.error("Material Generation Error:", error);
        res.status(500).json({ error: 'Failed to generate material' });
    }
};
