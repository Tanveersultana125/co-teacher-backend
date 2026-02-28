import Groq from "groq-sdk";
import { ImageService } from "./image.service";

const getGroq = () => {
    const key = process.env.GROQ_API_KEY;
    if (!key || key === "your_groq_api_key_here") return null;
    return new Groq({ apiKey: key });
};

const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

export class AIService {
    static async generateWithGroq(prompt: string, useFallback: boolean = false): Promise<any> {
        const groq = getGroq();
        if (!groq) throw new Error("Groq API Key not configured");

        const model = useFallback ? FALLBACK_MODEL : PRIMARY_MODEL;

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a world-class educational consultant. You MUST provide detailed, professional, and accurate content in strictly valid JSON format ONLY."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                model: model,
                temperature: 0.6,
                max_tokens: 4096,
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0].message.content || "{}";
            try {
                return JSON.parse(content);
            } catch (error) {
                const start = content.indexOf('{');
                const end = content.lastIndexOf('}');
                if (start !== -1 && end !== -1) {
                    return JSON.parse(content.substring(start, end + 1));
                }
                throw error;
            }
        } catch (error: any) {
            // Fallback to smaller model if rate limit or other error occurs on primary
            if (!useFallback && (error.status === 429 || error.message?.includes("limit"))) {
                console.warn("Primary model rate limited, falling back to 8B...");
                return this.generateWithGroq(prompt, true);
            }
            console.error("GROQ_GENERATION_ERROR:", error.message);
            throw error;
        }
    }

    static async generateLessonPlan(topic: string, grade: string, subject: string, pdfContext: string = "", unitDetails: string = "", duration: string = "45", numSessions: string = "1", curriculum: string = "Standard") {
        const lowerTopic = topic.toLowerCase();
        const lowerSubject = subject.toLowerCase();

        const isUrdu = lowerSubject.includes('urdu') || lowerTopic.includes('mazmoon') || lowerTopic.includes('navesi');
        const isHindi = lowerSubject.includes('hindi') || lowerSubject.includes('sanskrit');

        let languageInstruction = "Generate content in ENGLISH.";
        if (isUrdu) languageInstruction = "MANDATORY: Since this is an Urdu topic/subject, generate ALL content (title, objective, explanation, activities, etc.) in URDU SCRIPT (Perso-Arabic).";
        else if (isHindi) languageInstruction = "MANDATORY: Since this is a Hindi topic/subject, generate ALL content in HINDI (Devanagari script).";

        const prompt = `Act as an expert Senior Educator. Generate a professional, highly detailed, and narrative Lesson Plan for "${topic}".
        
        Language Instructions:
        ${languageInstruction}
        
        Details:
        - Grade: ${grade}, Subject: ${subject}
        - Board: ${curriculum}, Time: ${duration} mins
        ${unitDetails ? "- Unit Context: " + unitDetails : ""}
        ${pdfContext ? "- Reference Content: " + pdfContext.substring(0, 3000) : ""}

        Structure Requirements:
        - Use a descriptive, encouraging, and step-by-step narrative style.
        - 'explanation' must be a multi-paragraph, high-quality guide for the teacher.
        - 'activities' should have clear, pedagogical steps.

        Return strictly valid JSON:
        {
            "title": "Professional Title",
            "groupSize": "e.g. Groups of 5 students",
            "objective": ["Learning objective 1", "Learning objective 2"],
            "standardsAlignment": "Standards this lesson meets (e.g. NGSS, State board)",
            "materials": ["Material 1", "Material 2"],
            "explanation": "Provide a very thorough academic guide for the teacher explaining this concept in depth.",
            "pedagogy": "Describe the introduction/Hook strategy (10-15 mins).",
            "inquiryBasedLearning": "Strategy to encourage critical thinking.",
            "activities": [
                {
                    "time": "e.g. 20 mins",
                    "task": "Activity Title",
                    "description": "DETAILED step-by-step instructions.",
                    "recap": "Learning summary for this task.",
                    "tip": "Instructional tip for the teacher."
                }
            ],
            "closure": "Detailed Closure Activity (10 mins) with reflection tasks.",
            "assessment": {
                "formative": "Checks DURING the lesson.",
                "individual": "Evidence of learning AFTER the lesson (Worksheet/Quiz)."
            },
            "differentiation": {
                "struggling": "Detailed support tasks.",
                "advanced": "Extension challenge tasks.",
                "ell": "Visual aids and vocabulary support."
            },
            "homework": "Creative and meaningful follow-up task.",
            "questions": ["Review Q1", "Deep Thinking Q2"],
            "teachingStrategies": ["Active learning technique"],
            "estimatedTime": [
                {"section": "Introduction", "time": "15%"},
                {"section": "Concept", "time": "35%"},
                {"section": "Practice", "time": "40%"},
                {"section": "Closure", "time": "10%"}
            ],
            "videoSearchQuery": "Keywords for educational video",
            "motivationalQuote": "An inspiring quote for this lesson."
        }`;

        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            console.error("Lesson Plan Generation Error:", error);
            return this.getSimulatedLesson(topic, grade, subject, !!pdfContext);
        }
    }

    static async generatePresentation(topic: string, grade: string, curriculum: string, slides: number, subject: string = "General") {
        const isUrdu = subject.toLowerCase().includes('urdu');
        const prompt = `Generate ${slides} PowerPoint slides for ${topic}, grade ${grade}. 
        ${isUrdu ? 'MANDATORY: Return content (titles, text, activities) in URDU SCRIPT.' : ''}
        Return JSON: { "slides": [{"slide_number": 1, "title": "", "subtitle": "", "content": [], "activity": "", "image_keyword": "", "layout_type": ""}] }`;

        try {
            const res = await this.generateWithGroq(prompt);
            const aiSlides = res.slides || [];
            return await Promise.all(aiSlides.map(async (slide: any) => {
                let imageUrl = `https://source.unsplash.com/featured/1600x900?${encodeURIComponent(slide.image_keyword || topic)}`;
                try {
                    const pexelsUrl = await ImageService.getRandomImage(slide.image_keyword || topic);
                    if (pexelsUrl) imageUrl = pexelsUrl;
                } catch (e) { }
                return { ...slide, image_url: imageUrl };
            }));
        } catch (error) {
            return this.getSimulatedPPT(topic, grade, curriculum, slides);
        }
    }

    static async generateDataAnalysis(csvData: string, analysisType: string) {
        const prompt = `Analyze this CSV data (${analysisType}): ${csvData.substring(0, 10000)}. Return detailed JSON analysis.`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { success: false, message: "Analysis failed" };
        }
    }

    static async generateQuiz(topic: string, grade: string, subject: string, questionType: string, bloomLevel: string, count: number = 5) {
        const prompt = `Generate a ${count}-question ${questionType} quiz on "${topic}" for grade ${grade}.
        Subject: ${subject}, Bloom's Taxonomy Level: ${bloomLevel}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Arabic, etc.), use that language's script.
        - Otherwise, use ENGLISH.
        
        Return STRICT JSON format:
        {
            "title": "${topic} Quiz",
            "questions": [
                {
                    "id": 1,
                    "question": "Clear and concise question text?",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "correctAnswer": "The exact string from options that is correct",
                    "explanation": "Why this answer is correct."
                }
            ]
        }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: topic, questions: [] };
        }
    }

    static async generateMaterial(topic: string, type: string, grade?: string, subject?: string) {
        const prompt = `Generate detailed educational material (type: ${type}) for "${topic}".
        Grade: ${grade || "General"}, Subject: ${subject || "General"}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Arabic, etc.), use that language's script.
        - Otherwise, use ENGLISH.
        
        Return STRICT JSON format:
        {
            "title": "Comprehensive Topic Title",
            "chapterNumber": 1,
            "intro": "Engaging introduction to the topic.",
            "sections": [
                {
                    "heading": "Section Heading",
                    "content": "In-depth explanatory text for this section.",
                    "bulletPoints": ["Key fact 1", "Key fact 2", "Important detail"]
                }
            ],
            "learningObjectives": ["What student will learn 1", "What student will learn 2"],
            "illustrationDescription": "Detailed description of a diagram that should illustrate this concept.",
            "preparationTips": ["Study tip 1", "Self-study strategy"],
            "reviewQuestions": ["Deep thinking question 1", "Practice question 2"],
            "footer": "${subject || 'General'} | Grade ${grade || ''} | Standard Curriculum"
        }`;

        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: topic, intro: "Material generation failed. Please try again.", sections: [] };
        }
    }

    static async generateAssignment(topic: string, grade: string, subject: string, type: string, difficulty: string, count: string) {
        const isUrdu = subject.toLowerCase().includes('urdu');
        const prompt = `Generate a high-quality assignment on "${topic}" for grade ${grade}.
        Type: ${type}, Difficulty: ${difficulty}, Target Question Count: ${count}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Arabic, etc.), use that language's script for EVERYTHING.
        - Otherwise, use ENGLISH.
        
        Return STRICT JSON format:
        {
            "title": "${isUrdu ? 'تفویض' : topic + ' Assignment'}",
            "assignmentQuestions": ["Question 1"],
            "fillInTheBlanks": ["Statement with ____"],
            "activityQuestions": ["Task 1"],
            "projectIdeas": ["Idea 1"],
            "answers": {
                "assignmentQuestions": ["Answer 1"],
                "fillInTheBlanks": ["Word 1"],
                "activityQuestions": ["Guide 1"]
            }
        }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: topic, assignmentQuestions: [], fillInTheBlanks: [], projectIdeas: [] };
        }
    }

    static async generateQuestionPaper(subject: string, grade: string, marks: number, difficulty: string, examType: string, syllabus: string) {
        const isUrdu = subject.toLowerCase().includes('urdu');
        const prompt = `Generate a ${marks}-marks ${examType} question paper for ${subject}, grade ${grade}. 
        Difficulty: ${difficulty}. Syllabus Details: ${syllabus}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Arabic, etc.), use that language's script for ALL text.
        - Otherwise, use ENGLISH.
        
        Return STRICT JSON format:
        {
            "title": "${isUrdu ? 'پرچہ' : examType + ' - ' + subject}",
            "totalMarks": ${marks},
            "sections": [
                {
                    "name": "${isUrdu ? 'حصہ اول' : 'Section A'}",
                    "questions": [
                        {"text": "Actual question text here?", "marks": 1, "type": "MCQ", "options": ["Option 1", "Option 2", "Option 3", "Option 4"]}
                    ]
                }
            ],
            "answerKey": { "${isUrdu ? 'حصہ اول' : 'Section A'}": ["Correct Answers"] }
        }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: examType, totalMarks: marks, sections: [] };
        }
    }

    static async summarizeContent(content: string) {
        const prompt = `Summarize the following educational content: ${content.substring(0, 8000)}.
        Return STRICT JSON format:
        {
            "overview": "High-level summary",
            "keyPoints": ["Core concept 1", "Core concept 2"],
            "actionItems": ["Suggested activity for students", "Discussion point"]
        }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { overview: "Summary failed", keyPoints: [], actionItems: [] };
        }
    }

    static async extractVocabulary(text: string) {
        const prompt = `Extract difficult vocabulary from: ${text.substring(0, 3000)}. Return JSON: { "vocabulary": [{"word": "", "definition": "", "example": ""}] }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { vocabulary: [] };
        }
    }

    static async generateMiniQuiz(text: string) {
        const prompt = `Generate a 3-question mini-quiz. Return JSON: { "questions": [{"id": 1, "question": "", "options": [], "correctAnswer": ""}] }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { questions: [] };
        }
    }

    static async summarizeScannedPdf(buffer: Buffer) {
        // Since we want to use Groq, we'd need OCR first. 
        // For now, satisfy the compiler with an error message or basic fallback.
        throw new Error("Scanned PDF processing moved to new analysis route. Please use /api/analysis/pdf for better results.");
    }

    private static getSimulatedLesson(topic: string, grade: string, subject: string, hasPdf: boolean) {
        return {
            title: topic,
            objective: ["Objective placeholder"],
            materials: ["Material placeholder"],
            explanation: "Simulated content due to technical error.",
            pedagogy: "",
            activities: [],
            homework: "",
            questions: [],
            estimatedTime: [
                { "section": "Introduction", "time": "10m" },
                { "section": "Core", "time": "30m" }
            ]
        };
    }

    private static getSimulatedPPT(topic: string, grade: string, curriculum: string, numSlides: number) {
        return Array.from({ length: numSlides }).map((_, i) => ({ slide_number: i + 1, title: "Slide", content: [] }));
    }
}
