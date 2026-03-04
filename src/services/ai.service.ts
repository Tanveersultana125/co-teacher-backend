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
        const isTelugu = lowerSubject.includes('telugu');
        const isRegional = isUrdu || isHindi || isTelugu || lowerSubject.includes('tamil') || lowerSubject.includes('kannada') || lowerSubject.includes('marathi') || lowerSubject.includes('bengali') || lowerSubject.includes('arabic');

        let languageInstruction = "Generate content in ENGLISH.";
        if (isUrdu) languageInstruction = "MANDATORY: Since this is an Urdu topic/subject, generate ALL content (title, objective, explanation, activities, etc.) in URDU SCRIPT (Perso-Arabic).";
        else if (isHindi) languageInstruction = "MANDATORY: Since this is a Hindi topic/subject, generate ALL content in HINDI (Devanagari script).";
        else if (isTelugu) languageInstruction = "MANDATORY: Since this is a Telugu topic/subject, generate ALL content in TELUGU SCRIPT.";
        else if (isRegional) languageInstruction = `MANDATORY: Since this is a ${subject} topic/subject, generate ALL content in ${subject} script.`;

        const prompt = `Act as an expert Senior Educator. Generate a professional, highly detailed, and narrative Lesson Plan for "${topic}".
        
        Language Instructions:
        ${languageInstruction}
        
        Details:
        - Grade: ${grade}, Subject: ${subject}
        - Board: ${curriculum}, Time: ${duration} mins
        ${unitDetails ? "- Unit Context: " + unitDetails : ""}
        ${pdfContext ? "- Reference Content: " + pdfContext.substring(0, 100000) : ""}

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

    static async generatePPTSlides(topic: string) {
        const prompt = `Generate a professional PowerPoint presentation structure.
        Topic: ${topic}
        Create 8 slides.
        Return strictly in JSON format:
        {
          "slides":[
            {
              "title":"Slide Title",
              "points":[
                "short bullet point",
                "short bullet point",
                "short bullet point",
                "short bullet point"
              ],
              "imageQuery":"detailed descriptive prompt for a professional educational illustration or photo"
            }
          ]
        }
        Rules:
        - Each slide must contain 3-4 short bullet points
        - Text must be presentation friendly
        - First slide must be introduction
        - Last slide must be conclusion
        - imageQuery should be a detailed 10-15 word prompt describing the topic visually for an AI generator
        - Do not include explanations outside JSON`;

        try {
            return await this.generateWithGroq(prompt);
        } catch (error: any) {
            console.error("AI PPT Generation Error:", error);
            throw error;
        }
    }

    static async generateDataAnalysis(csvData: string, analysisType: string) {
        let schemaPrompt = "";

        if (analysisType === "class_performance") {
            schemaPrompt = `
            Return JSON with this structure:
            {
                "summary": {
                    "performingWell": [{"subject": "Math", "score": 85}],
                    "struggling": [{"subject": "Science", "score": 45}]
                },
                "overallStats": { "average": 70, "highest": 95, "lowest": 30 },
                "subjectInsights": {
                    "SubjectName": {
                        "average": 75,
                        "highest": 98,
                        "lowest": 40,
                        "distribution": [{"range": "0-20", "count": 2}, {"range": "21-40", "count": 5}, {"range": "41-60", "count": 10}, {"range": "61-80", "count": 15}, {"range": "81-100", "count": 8}],
                        "suggestions": ["suggestion 1", "suggestion 2"]
                    }
                },
                "improvementPlan": ["Step 1", "Step 2"]
            }`;
        } else if (analysisType === "student_performance") {
            schemaPrompt = `
            Return JSON with this structure:
            {
                "toppers": [{"name": "Student A", "percentage": 95, "rank": 1}],
                "struggling": [{"name": "Student B", "percentage": 35, "needsHelpIn": "Math"}],
                "allStudents": [{"name": "Student A", "total": 450, "percentage": 90, "grade": "A", "remarks": "Excellent"}]
            }`;
        } else if (analysisType === "attendance_analysis") {
            schemaPrompt = `
            Return JSON with this structure:
            {
                "overallAttendance": 85,
                "correlation": "High attendance leads to better scores",
                "lowAttendanceList": [{"name": "Student C", "attendance": 60, "performanceStatus": "Poor"}],
                "insights": ["Insight 1", "Insight 2"]
            }`;
        }

        const prompt = `Analyze this student data (CSV format):
        ${csvData.substring(0, 50000)}
        
        Task: Perform a ${analysisType.split('_').join(' ')} and provide deep insights.
        
        Requirements:
        ${schemaPrompt}
        - Return ONLY valid JSON.
        - Be accurate and calculate real averages/stats from the data provided.`;

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
        - If the subject is a language (Urdu, Hindi, Telugu, Tamil, Arabic, etc.), you MUST generate the entire content (questions, options, etc.) in that specific language's script.
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
        const lowerSubject = subject?.toLowerCase() || "";
        const isUrdu = lowerSubject.includes('urdu');
        const isHindi = lowerSubject.includes('hindi');
        const isTelugu = lowerSubject.includes('telugu');
        const isRegional = isUrdu || isHindi || isTelugu || lowerSubject.includes('tamil') || lowerSubject.includes('kannada') || lowerSubject.includes('marathi') || lowerSubject.includes('bengali') || lowerSubject.includes('arabic');

        const prompt = `Generate highly detailed, comprehensive textbook-style educational material for "${topic}".
        Grade: ${grade || "General"}, Subject: ${subject || "General"}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Telugu, Tamil, Arabic, etc.), you MUST generate the entire content in that specific language's script.
        - Otherwise, use ENGLISH.
        
        Return STRICT JSON format:
        {
            "title": "Comprehensive Topic Title",
            "chapterNumber": 1,
            "intro": "Write a very detailed, multi-paragraph introduction that sets the stage for the topic.",
            "keyPoints": ["Summarize 5-7 most critical core concepts or facts here"],
            "sections": [
                {
                    "heading": "Section Heading",
                    "content": "Provide a very deep and thorough academic explanation (at least 3-4 paragraphs) for this sub-topic. Use a narrative and professional tone.",
                    "bulletPoints": ["Detailed supporting fact 1", "Important definition", "Concept nuance"]
                }
            ],
            "learningObjectives": ["Specific, measurable goal 1", "Goal 2"],
            "illustrationDescription": "Write a very precise description for an illustrator to draw a diagram (like a labeled anatomical or flow diagram) related to this specific topic.",
            "preparationTips": ["Practical Study Tip 1", "Exam Strategy 2", "Memory Hook 3"],
            "reviewQuestions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5", "Question 6", "Question 7"],
            "answerKey": ["Complete Answer 1", "Complete Answer 2", "Complete Answer 3", "Complete Answer 4", "Complete Answer 5", "Complete Answer 6", "Complete Answer 7"],
            "footer": "${subject || 'General'} | Grade ${grade || ''} | Standard Curriculum"
        }`;

        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: topic, intro: "Material generation failed. Please try again.", sections: [] };
        }
    }

    static async generateAssignment(topic: string, grade: string, subject: string, type: string, difficulty: string, count: string) {
        const lowerSubject = subject.toLowerCase();
        const isUrdu = lowerSubject.includes('urdu');
        const isHindi = lowerSubject.includes('hindi');
        const isTelugu = lowerSubject.includes('telugu');
        const prompt = `Generate a high-quality, professional academic assignment for "${topic}" (Grade ${grade}).
        Subject: ${subject}, Difficulty: ${difficulty}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Telugu, Tamil, Arabic, etc.), use that language's script for ALL content.
        - Otherwise, use ENGLISH.
        
        Return STRICT JSON format:
        {
            "title": "${isUrdu ? 'تفویض' : isHindi ? 'सत्रीय कार्य' : isTelugu ? 'అసైన్‌మెంట్' : topic + ' Assignment'}",
            "intro": "Brief academic introduction to the topic for the assignment.",
            "keyPoints": ["Crucial concept 1", "Important fact 2"],
            "mcqs": [
                {"question": "Professional MCQ Question 1", "options": ["Option A", "Option B", "Option C", "Option D"], "correct": "Option B"}
            ],
            "matchFollowing": [
                {"left": "Item 1", "right": "Matching Item 1"}
            ],
            "assignmentQuestions": ["Descriptive/Short Answer Question 1"],
            "fillInTheBlanks": ["Important sentence with a ____"],
            "activityQuestions": ["Practical hands-on task or experiment"],
            "projectIdeas": ["A long-term project or research idea"],
            "answers": {
                "mcqs": ["Option B"],
                "matchFollowing": ["Item 1 -> Matching Item 1"],
                "assignmentQuestions": ["Detailed answer to question 1"],
                "fillInTheBlanks": ["Correct word for blank 1"],
                "activityQuestions": ["Guide or expected outcome for activity"],
                "projectIdeas": ["Basic outline for project"]
            }
        }`;

        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: topic, assignmentQuestions: [], fillInTheBlanks: [], projectIdeas: [] };
        }
    }

    static async generateQuestionPaper(subject: string, grade: string, marks: number, difficulty: string, examType: string, syllabus: string) {
        const lowerSubject = subject.toLowerCase();
        const isUrdu = lowerSubject.includes('urdu');
        const isHindi = lowerSubject.includes('hindi');
        const isTelugu = lowerSubject.includes('telugu');

        const sectionAName = isUrdu ? 'حصہ اول (معروضی سوالات)' : isHindi ? 'खंड क (वस्तुनिष्ठ प्रश्न)' : isTelugu ? 'విభాగం A (మల్టిపుల్ ఛాయిస్)' : 'Section A (Objective Type)';
        const sectionBName = isUrdu ? 'حصہ دوم (مختصر جوابات)' : isHindi ? 'खंड ख (लघु उत्तरीय प्रश्न)' : isTelugu ? 'విభాగం B (స్వల్ప సమాధానాలు)' : 'Section B (Short Answer Type)';
        const sectionCName = isUrdu ? 'حصہ سوم (طویل جوابات)' : isHindi ? 'खंड ग (दीर्घ उत्तरीय प्रश्न)' : isTelugu ? 'విభాగం C (దీర్ఘ సమాధానాలు)' : 'Section C (Long Answer Type)';

        const prompt = `Generate a professional ${marks}-marks ${examType} question paper for ${subject}, grade ${grade}.
        Difficulty: ${difficulty}. Syllabus Coverage: ${syllabus}.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Telugu, Tamil, Arabic, etc.), use that language's script for ALL text.
        - Otherwise, use ENGLISH.
        
        Requirement:
        - Include ${sectionAName} with MCQs (1 mark each).
        - Include ${sectionBName} with Short Answers (3-5 marks each).
        - Include ${sectionCName} with Long Answers (8-10 marks each).
        - Provide a comprehensive Answer Key and Marking Scheme.

        Return STRICT JSON format:
        {
            "title": "${isUrdu ? 'پرچہ سوالات' : isHindi ? 'प्रश्न पत्र' : isTelugu ? 'ప్రశ్నపత్రం' : examType + ' Examination'} - ${subject}",
            "totalMarks": ${marks},
            "difficulty": "${difficulty}",
            "sections": [
                {
                    "name": "${sectionAName}",
                    "questions": [
                        { "text": "MCQ Question Text", "marks": 1, "type": "MCQ", "options": ["Option 1", "Option 2", "Option 3", "Option 4"] }
                    ]
                },
                {
                    "name": "${sectionBName}",
                    "questions": [
                        { "text": "Short Answer Question Text", "marks": 5, "type": "Short" }
                    ]
                },
                {
                    "name": "${sectionCName}",
                    "questions": [
                        { "text": "Long Answer Question Text", "marks": 10, "type": "Long" }
                    ]
                }
            ],
            "answerKey": {
                "${sectionAName}": ["Answer 1", "Answer 2"],
                "${sectionBName}": ["Key answer points for 1", "Key points for 2"],
                "${sectionCName}": ["Detailed expected response for 1"]
            },
            "markingScheme": "General evaluation guidelines: Correct steps for math, keyword matching for science/social."
        }`;

        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: examType, totalMarks: marks, sections: [] };
        }
    }

    static async summarizeContent(content: string) {
        const prompt = `Summarize the following educational content: ${content.substring(0, 100000)}.
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
        const prompt = `Extract difficult vocabulary from: ${text.substring(0, 100000)}. Return JSON: { "vocabulary": [{ "word": "", "definition": "", "example": "" }] }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { vocabulary: [] };
        }
    }

    static async generateMiniQuiz(text: string) {
        const isUrdu = /[\u0600-\u06FF]/.test(text);
        const isHindi = /[\u0900-\u097F]/.test(text);

        const prompt = `Generate a 3-question mini-quiz BASED STRICTLY on the following content:
        
        Content: ${text.substring(0, 50000)}
        
        Requirements:
        1. All questions must be derived from the content provided above.
        2. ${isUrdu ? "MANDATORY: Since the content is in Urdu, generate ALL questions and options in URDU SCRIPT." : isHindi ? "MANDATORY: Since the content is in Hindi, generate ALL questions and options in HINDI." : "Generate content in English."}
        
        Return STRICT JSON format:
        {
            "questions": [
                {
                    "id": 1,
                    "question": "Question text here",
                    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
                    "correctAnswer": "Exact string of the correct option"
                }
            ]
        }`;
        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { questions: [] };
        }
    }

    static async summarizeScannedPdf(buffer: Buffer) {
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
