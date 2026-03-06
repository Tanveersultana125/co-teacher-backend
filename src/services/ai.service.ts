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

    static async generateLessonPlan(topic: string, grade: string, subject: string, pdfContext: string = "", unitDetails: string = "", duration: string = "45", numSessions: string = "1", curriculum: string = "Standard", language: string = "auto") {
        const lowerTopic = topic.toLowerCase();
        const lowerSubject = subject.toLowerCase();

        const isUrdu = language === "Urdu" || (language === "auto" && (lowerSubject.includes('urdu') || lowerTopic.includes('mazmoon') || lowerTopic.includes('navesi') || /[\u0600-\u06FF]/.test(topic)));
        const isHindi = language === "Hindi" || (language === "auto" && (lowerSubject.includes('hindi') || lowerSubject.includes('sanskrit') || /[\u0900-\u097F]/.test(topic)));
        const isTelugu = language === "Telugu" || (language === "auto" && (lowerSubject.includes('telugu') || /[\u0C00-\u0C7F]/.test(topic)));
        const isRegional = isUrdu || isHindi || isTelugu || lowerSubject.includes('tamil') || lowerSubject.includes('kannada') || lowerSubject.includes('marathi') || lowerSubject.includes('bengali') || lowerSubject.includes('arabic');

        let languageInstruction = "Generate content in ENGLISH.";
        if (isUrdu) languageInstruction = "MANDATORY: Since this is an Urdu topic/subject, generate ALL content (title, objective, explanation, activities, assessment, questions, etc.) in URDU SCRIPT (Perso-Arabic). Be extremely verbose and detailed.";
        else if (isHindi) languageInstruction = "MANDATORY: Since this is a Hindi topic/subject, generate ALL content in HINDI (Devanagari script). Be comprehensive and academic.";
        else if (isTelugu) languageInstruction = "MANDATORY: Since this is a Telugu topic/subject, generate ALL content (title, objectives, explanation, activities, Assessment, homework, teacher tips, etc.) STRICTLY in TELUGU SCRIPT. DO NOT use English for descriptions. Be very detailed, use 3-4 sections for the explanation, and ensure 2-3 distinct activities are provided.";
        else if (isRegional) languageInstruction = `MANDATORY: Since this is a ${subject} topic/subject, generate ALL content in the native script of ${subject}.`;

        const prompt = `Act as an expert Senior Educator. Generate a professional, highly detailed, and narrative Lesson Plan for "${topic}".
        
        Language Instructions:
        ${languageInstruction}
        MANDATORY: 'videoSearchQuery' and 'visualAids' prompts MUST be in ENGLISH even if the lesson content is in a regional language. This is for search engine compatibility.
        
        Details:
        - Grade: ${grade}, Subject: ${subject}
        - Board: ${curriculum}, Time: ${duration} mins
        ${unitDetails ? "- Unit Context: " + unitDetails : ""}
        ${pdfContext ? "- Reference Content: " + pdfContext.substring(0, 15000) : ""} 

        Structure Requirements:
        - Use a descriptive, encouraging, and step-by-step narrative style.
        - 'explanation' must be a multi-paragraph, high-quality guide for the teacher (at least 500 words).
        - 'activities' should have clear, pedagogical steps and be engaging.

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
            "videoSearchQuery": "Keywords for educational video (MUST BE IN ENGLISH)",
            "visualAids": ["English description for image 1", "English description for image 2", "English description for image 3"],
            "motivationalQuote": "An inspiring quote for this lesson."
        }`;

        try {
            console.log(`[AI] Generating Lesson Plan for: ${topic} (${grade})`);
            return await this.generateWithGroq(prompt);
        } catch (error: any) {
            console.error("[AI] Lesson Plan Generation Failed:", error.message);
            // If it's a context length error, try one more time with even less context
            if (error.message?.includes("context") && pdfContext) {
                console.warn("[AI] Context too long, retrying with minimal context...");
                const minimalPrompt = prompt.replace(pdfContext.substring(0, 15000), pdfContext.substring(0, 5000));
                try { return await this.generateWithGroq(minimalPrompt); } catch (e) { }
            }
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

    static async generateQuiz(topic: string, grade: string, subject: string, questionType: string, bloomLevel: string, count: number = 5, language: string = "auto") {
        const isUrdu = language === "Urdu" || (language === "auto" && (subject.toLowerCase().includes('urdu') || topic.toLowerCase().includes('mazmoon') || /[\u0600-\u06FF]/.test(topic)));
        const isHindi = language === "Hindi" || (language === "auto" && (subject.toLowerCase().includes('hindi') || /[\u0900-\u097F]/.test(topic)));
        const isTelugu = language === "Telugu" || (language === "auto" && (subject.toLowerCase().includes('telugu') || /[\u0C00-\u0C7F]/.test(topic)));

        const prompt = `Generate a ${count}-question ${questionType} quiz on "${topic}" for grade ${grade}.
        Subject: ${subject}, Bloom's Taxonomy Level: ${bloomLevel}.
        
        Language Instructions:
        - ${isUrdu ? "MANDATORY: Generate everything in URDU SCRIPT." : isHindi ? "MANDATORY: Generate everything in HINDI." : isTelugu ? "MANDATORY: Generate everything in TELUGU SCRIPT." : "Use ENGLISH."}
        
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

    static async generateMaterial(topic: string, type: string, grade?: string, subject?: string, language: string = "auto") {
        const lowerSubject = subject?.toLowerCase() || "";
        const isUrdu = language === "Urdu" || (language === "auto" && (lowerSubject.includes('urdu') || /[\u0600-\u06FF]/.test(topic)));
        const isHindi = language === "Hindi" || (language === "auto" && (lowerSubject.includes('hindi') || /[\u0900-\u097F]/.test(topic)));
        const isTelugu = language === "Telugu" || (language === "auto" && (lowerSubject.includes('telugu') || /[\u0C00-\u0C7F]/.test(topic)));

        const prompt = `Generate highly detailed, comprehensive textbook-style educational material for "${topic}".
        Grade: ${grade || "General"}, Subject: ${subject || "General"}.
        
        Language Instructions:
        - ${isUrdu ? "MANDATORY: Generate everything in URDU SCRIPT." : isHindi ? "MANDATORY: Generate everything in HINDI." : isTelugu ? "MANDATORY: Generate everything in TELUGU SCRIPT." : "Use ENGLISH."}
        
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

    static async generateAssignment(topic: string, grade: string, subject: string, type: string, difficulty: string, count: string, language: string = "auto") {
        const lowerSubject = subject.toLowerCase();
        const isUrdu = language === "Urdu" || (language === "auto" && (lowerSubject.includes('urdu') || /[\u0600-\u06FF]/.test(topic)));
        const isHindi = language === "Hindi" || (language === "auto" && (lowerSubject.includes('hindi') || /[\u0900-\u097F]/.test(topic)));
        const isTelugu = language === "Telugu" || (language === "auto" && (lowerSubject.includes('telugu') || /[\u0C00-\u0C7F]/.test(topic)));

        let structurePrompt = "";
        if (type === "Worksheet") {
            structurePrompt = `
            "content": {
                "sectionA_MCQs": [{"q": "Question text", "options": ["A", "B", "C", "D"], "correct": "Correct Option"}],
                "sectionB_FillBlanks": ["Sentence with a ____"],
                "sectionC_Match": [{"left": "Term", "right": "Definition"}],
                "sectionD_ShortAnswers": ["What is..."]
            },
            "answerKey": {
                "MCQs": ["Correct Option"],
                "FillBlanks": ["Answer"],
                "Match": ["Term -> Definition"],
                "ShortAnswers": ["Model Answer"]
            }`;
        } else if (type === "Project") {
            structurePrompt = `
            "content": {
                "questions": ["Research question 1", "Concept question 2"],
                "activities": ["Step 1: Research", "Step 2: Build"]
            },
            "answerKey": {
                "Project": ["Guidelines and expected outcomes"]
            }`;
        } else {
            // Default for Homework
            structurePrompt = `
            "content": {
                "assignmentQuestions": ["Short answer question 1", "Critical thinking question 2"],
                "fillInTheBlanks": ["Blank 1", "Blank 2"],
                "activityQuestions": ["Home experiment 1"],
                "projectIdeas": ["Mini-project idea"]
            },
            "answerKey": {
                "Questions": ["Answer 1"],
                "Blanks": ["Answer"],
                "Activities": ["Outcome"]
            }`;
        }

        const prompt = `Generate a professional educational ${type} for "${topic}" (Grade ${grade}).
        Subject: ${subject}, Difficulty: ${difficulty}, Target Count: ${count} questions per major section.
        
        Language Instructions:
        - ${isUrdu ? "MANDATORY: Generate everything in URDU SCRIPT." : isHindi ? "MANDATORY: Generate everything in HINDI." : isTelugu ? "MANDATORY: Generate everything in TELUGU SCRIPT." : "Use ENGLISH."}
        
        Return STRICT JSON format:
        {
            "title": "${isUrdu ? 'تفویض' : isHindi ? 'सत्रीय कार्य' : isTelugu ? 'అసైన్‌మెంట్' : topic + ' ' + type}",
            "instructions": ["Read questions carefully", "Answer in your own words"],
            ${structurePrompt}
        }`;


        try {
            return await this.generateWithGroq(prompt);
        } catch (error) {
            return { title: topic, assignmentQuestions: [], fillInTheBlanks: [], projectIdeas: [] };
        }
    }

    static async generateQuestionPaper(subject: string, grade: string, marks: number, difficulty: string, examType: string, syllabus: string, language: string = "auto") {
        const lowerSubject = subject.toLowerCase();
        const isUrdu = language === "Urdu" || (language === "auto" && (lowerSubject.includes('urdu') || /[\u0600-\u06FF]/.test(syllabus)));
        const isHindi = language === "Hindi" || (language === "auto" && (lowerSubject.includes('hindi') || /[\u0900-\u097F]/.test(syllabus)));
        const isTelugu = language === "Telugu" || (language === "auto" && (lowerSubject.includes('telugu') || /[\u0C00-\u0C7F]/.test(syllabus)));

        const sectionAName = isUrdu ? 'حصہ اول (معروضی سوالات)' : isHindi ? 'खंड क (वस्तुनिष्ठ प्रश्न)' : isTelugu ? 'విభాగం A (మల్టిపుల్ ఛాయిస్)' : 'Section A (Objective Type)';
        const sectionBName = isUrdu ? 'حصہ دوم (مختصر جوابات)' : isHindi ? 'खंड ख (लघु उत्तरीय प्रश्न)' : isTelugu ? 'విభాగం B (స్వల్ప సమాధానాలు)' : 'Section B (Short Answer Type)';
        const sectionCName = isUrdu ? 'حصہ سوم (طویل جوابات)' : isHindi ? 'खंड ग (दीर्घ उत्तरीय प्रश्न)' : isTelugu ? 'విభాగం C (దీర్ఘ సమాధానాలు)' : 'Section C (Long Answer Type)';

        const prompt = `Generate a professional ${marks}-marks ${examType} question paper for ${subject}, grade ${grade}.
        Difficulty: ${difficulty}. Syllabus Coverage: ${syllabus}.
        
        CRITICAL REQUIREMENT:
        - The TOTAL sum of marks for all questions MUST BE EXACTLY ${marks}.
        - Do not just provide 1-2 questions per section. Calculate the number of questions based on marks.
        
        Recommended Distribution (Adjust slightly to reach exactly ${marks} if needed):
        1. ${sectionAName}: MCQs (1 mark each) - Total ~20% of total marks.
        2. ${sectionBName}: Short Answer Type (3 or 5 marks each) - Total ~40% of total marks.
        3. ${sectionCName}: Long Answer Type (8 or 10 marks each) - Total ~40% of total marks.
        
        Language Instructions:
        - If the subject is a language (Urdu, Hindi, Telugu, Tamil, Arabic, etc.), use that language's script for ALL text.
        - Otherwise, use ENGLISH.
        
        Deliverables:
        - Full Question Paper with calculated marks.
        - Comprehensive Answer Key.
        - Step-wise Marking Scheme.

        Return STRICT JSON format:
        {
            "title": "${isUrdu ? 'پرچہ سوالات' : isHindi ? 'प्रश्न पत्र' : isTelugu ? 'ప్రశ్నపత్రం' : examType + ' Examination'} - ${subject}",
            "totalMarks": ${marks},
            "difficulty": "${difficulty}",
            "sections": [
                {
                    "name": "${sectionAName}",
                    "questions": [
                        { "id": "1", "text": "Question...", "marks": 1, "type": "MCQ", "options": ["A", "B", "C", "D"] }
                    ]
                },
                {
                    "name": "${sectionBName}",
                    "questions": [
                        { "id": "11", "text": "Question...", "marks": 5, "type": "Short" }
                    ]
                },
                {
                    "name": "${sectionCName}",
                    "questions": [
                        { "id": "21", "text": "Question...", "marks": 10, "type": "Long" }
                    ]
                }
            ],
            "answerKey": {
                "Section Name": ["Answer 1", "Answer 2"]
            },
            "markingScheme": "Evaluation guidelines..."
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
        const lowerSubject = subject.toLowerCase();
        const lowerTopic = topic.toLowerCase();

        const isUrdu = lowerSubject.includes('urdu') || lowerTopic.includes('mazmoon') || /[\u0600-\u06FF]/.test(topic);
        const isHindi = lowerSubject.includes('hindi') || /[\u0900-\u097F]/.test(topic);
        const isTelugu = lowerSubject.includes('telugu') || /[\u0C00-\u0C7F]/.test(topic);

        if (isUrdu) {
            return {
                title: topic,
                objective: [`${topic} کے بنیادی تصورات کو سمجھنا`, `${topic} کے اصولوں کا عملی مشقوں میں اطلاق`],
                materials: ["درسی کتاب", "نوٹ بک", "وائٹ بورڈ"],
                explanation: "آپ کا سبق تیار ہے۔ فی الحال AI انجن پر زیادہ بوجھ کی وجہ سے یہ ایک بنیادی خاکہ ہے۔ مکمل تفصیل کے لیے براہ کرم دوبارہ کوشش کریں یا صفحہ ریفریش کریں۔",
                pedagogy: "کلاس روم ڈسکشن اور براہ راست ہدایات۔",
                activities: [{ "time": "20 منٹ", "task": "بنیادی مطالعہ", "description": `${topic} سے متعلق مثالوں پر کام۔`, "recap": "خلاصہ", "tip": "طلبہ کی حوصلہ افزائی کریں۔" }],
                videoSearchQuery: topic,
                motivationalQuote: "علم وہ طاقت ہے جس سے آپ دنیا بدل سکتے ہیں۔"
            };
        }

        if (isHindi) {
            return {
                title: topic,
                objective: [`${topic} की मूल अवधारणाओं को समझना`, `${topic} के सिद्धांतों को व्यवहार में लाना`],
                materials: ["पाठ्यपुस्तक", "नोटबुक", "व्हाइटबोर्ड"],
                explanation: "क्षमा करें, AI इंजन व्यस्त है। यह एक बुनियादी रूपरेखा है। कृपया पूर्ण विवरण के लिए पुनः प्रयास करें।",
                pedagogy: "कक्षा चर्चा।",
                activities: [{ "time": "20 मिनट", "task": "मुख्य अभ्यास", "description": `${topic} पर आधारित कार्य।`, "recap": "सारांश", "tip": "छात्रों को प्रेरित करें।" }],
                videoSearchQuery: topic,
                motivationalQuote: "शिक्षा सबसे शक्तिशाली हथियार है।"
            };
        }

        if (isTelugu) {
            return {
                title: topic,
                objective: [`${topic} యొక్క ప్రాథమిక భావనలను అర్థం చేసుకోవడం`],
                materials: ["పాఠ్యపుస్తకం", "నోట్బుక్"],
                explanation: "AI ఇంజిన్ లోడ్ కారణంగా ఇది ప్రాథమిక రూపురేఖలు మాత్రమే. దయచేసి మళ్ళీ ప్రయత్నించండి.",
                activities: [{ "time": "20 నిమిషాలు", "task": "అభ్యాసం", "description": `${topic} పై కృత్యాలు.`, "recap": "ముగింపు", "tip": "విద్యార్థులను ప్రోత్సహించండి." }],
                videoSearchQuery: topic,
                motivationalQuote: "విద్య అనేది ప్రపంచాన్ని మార్చగల శక్తివంతమైన ఆయుధం."
            };
        }

        return {
            title: topic,
            objective: [
                `Understand the core concepts of ${topic}`,
                `Apply ${topic} principles in practical exercises`
            ],
            materials: ["Textbook", "Notebook", "Whiteboard", "Teacher's Guide"],
            explanation: `This is a comprehensive overview of ${topic} for Grade ${grade}. Due to a temporary high load on our AI engine, we've provided this structured outline. Please refresh or try again for a full narrative explanation.`,
            pedagogy: "Classroom discussion and direct instruction.",
            inquiryBasedLearning: "What are some real-world examples of this topic?",
            activities: [
                {
                    "time": "20 mins",
                    "task": "Core Exploration",
                    "description": `Students work on examples related to ${topic}.`,
                    "recap": "Discuss the results as a class.",
                    "tip": "Encourage participation from all students."
                }
            ],
            closure: "Summary of key takeaways.",
            homework: `Review the chapter on ${topic} and complete exercises.`,
            questions: [`What is the main idea of ${topic}?`],
            teachingStrategies: ["Active Learning"],
            estimatedTime: [
                { "section": "Introduction", "time": "15%" },
                { "section": "Core Content", "time": "45%" },
                { "section": "Activities", "time": "30%" },
                { "section": "Closure", "time": "10%" }
            ],
            videoSearchQuery: topic,
            motivationalQuote: "Education is the most powerful weapon which you can use to change the world."
        };
    }

    private static getSimulatedPPT(topic: string, grade: string, curriculum: string, numSlides: number) {
        return Array.from({ length: numSlides }).map((_, i) => ({ slide_number: i + 1, title: "Slide", content: [] }));
    }
}
