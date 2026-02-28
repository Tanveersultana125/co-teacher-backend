import Groq from "groq-sdk";
import { extractStrictJSON } from "../utils/analysis-utils";

/**
 * Production-ready Groq service for strictly JSON analysis
 */
export class GroqAnalysisService {
    private static getClient() {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey || apiKey.length < 5) {
            throw new Error("GROQ_API_KEY is missing in .env.");
        }
        return new Groq({ apiKey });
    }

    static async analyzeChunk(chunk: string, retryCount: number = 1): Promise<any> {
        const groq = this.getClient();

        const systemPrompt = `You are a Professional Senior Professor. 
Your goal is to transform the provided text into a high-quality, in-depth Study Guide.

STUDY GUIDE CONTENT REQUIREMENTS:
1. COMPREHENSIVE LECTURE NOTES (Summary):
   - Provide a detailed academic summary (approx 200 words).
   - Explain the "How" and "Why" behind the concepts.
   - Expand on core concepts if the text is short.

2. KEY LEARNING POINTS:
   - Provide 7 to 10 important concepts.
   - For EACH point, provide a HEADING and 1-2 sentences of explanation.
   - Format: "Heading: Detailed explanation text"

3. KNOWLEDGE CHECK (Quiz):
   - Generate exactly 5 multiple-choice questions.
   - 'answer' must be the FULL TEXT of the correct option.

JSON RESPONSE FORMAT (Strict):
{
  "summary": "Full detailed multi-paragraph overview...",
  "key_points": [
      "Heading: Long detailed explanation 1...",
      "Heading: Long detailed explanation 2...",
      "Heading: Long detailed explanation 3..."
  ],
  "quiz": [
    { "question": "Q1?", "options": ["A", "B", "C", "D"], "answer": "Answer Text" },
    { "question": "Q2?", "options": ["A", "B", "C", "D"], "answer": "Answer Text" },
    { "question": "Q3?", "options": ["A", "B", "C", "D"], "answer": "Answer Text" },
    { "question": "Q4?", "options": ["A", "B", "C", "D"], "answer": "Answer Text" },
    { "question": "Q5?", "options": ["A", "B", "C", "D"], "answer": "Answer Text" }
  ]
}

RULES:
- Return ONLY the JSON object. No conversational text.
- No markdown formatting.`;

        try {
            console.log("[GROQ] Sending request to llama-3.3-70b-versatile...");
            const response = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Content to expand: \n\n${chunk}` }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.3,
                max_tokens: 3000,
                response_format: { type: "json_object" }
            });

            const rawContent = response.choices[0]?.message?.content || "";
            let parsed = null;
            try {
                parsed = extractStrictJSON(rawContent);
            } catch (jsonErr: any) {
                console.error("[GROQ-JSON-FAILED] Error:", jsonErr.message);
                if (retryCount > 0) return await this.analyzeChunk(chunk, retryCount - 1);
                throw new Error("AI returned invalid format.");
            }

            if (!parsed) throw new Error("AI response could not be parsed.");

            const validatedResult = {
                summary: parsed.summary || "No summary generated.",
                key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
                quiz: Array.isArray(parsed.quiz) ? parsed.quiz : []
            };

            console.log("[GROQ-OK] Analysis successful.");
            return validatedResult;
        } catch (error: any) {
            console.error("[GROQ] Fatal Error:", error.message);
            throw new Error(`AI analysis failed: ${error.message}`);
        }
    }

    static mergeResults(results: any[]): any {
        const merged = {
            summary: results
                .filter(r => r && typeof r.summary === 'string')
                .map(r => r.summary)
                .join("\n\n"),
            key_points: results
                .filter(r => r && Array.isArray(r.key_points))
                .flatMap(r => r.key_points),
            quiz: results
                .filter(r => r && Array.isArray(r.quiz))
                .flatMap(r => r.quiz)
        };

        // Unique key points only
        merged.key_points = [...new Set(merged.key_points)];

        return merged;
    }
}
