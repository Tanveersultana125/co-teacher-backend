import axios from 'axios';

const PEXELS_URL = 'https://api.pexels.com/v1/search';

export class ImageService {
    static async getRandomImage(query: string): Promise<string> {
        const apiKey = process.env.PEXELS_API_KEY;

        // Validation: Pexels keys are alphanumeric. sk- or gsk_ are OpenAI/Groq keys.
        const isValidPexelsKey = apiKey &&
            apiKey !== 'your_pexels_api_key_here' &&
            !apiKey.startsWith('sk-') &&
            !apiKey.startsWith('gsk_');

        if (isValidPexelsKey) {
            try {
                console.log(`[ImageService] Searching Pexels for: ${query}`);
                const response = await axios.get(PEXELS_URL, {
                    params: { query, per_page: 1, orientation: 'landscape' },
                    headers: { Authorization: apiKey }
                });

                if (response.data.photos && response.data.photos.length > 0) {
                    const url = response.data.photos[0].src.large2x;
                    console.log(`[ImageService] Pexels Success: ${url}`);
                    return url;
                }
            } catch (error: any) {
                console.error("[ImageService] Pexels Error:", error.message);
            }
        } else {
            console.warn("[ImageService] No valid Pexels key found. Falling back to AI Visuals.");
        }

        // Secondary Fallback: Pollinations AI (Generates highly specific visuals)
        try {
            console.log(`[ImageService] Using AI fallback for: ${query}`);
            const seed = Math.floor(Math.random() * 1000000);
            return `https://image.pollinations.ai/prompt/${encodeURIComponent(query + ", educational style, high quality")},?width=1024&height=768&seed=${seed}&nologo=1&model=flux`;
        } catch (e) {
            // Final Fallback: Stable static placeholder
            return `https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=1600&q=80`;
        }
    }

    static generateDiagramUrl(description: string): string {
        if (!description) return "";

        // Clean and optimize the prompt for a professional educational diagram
        const cleanPrompt = description
            .replace(/[^\w\s]/gi, '')
            .substring(0, 300);

        const enhancedPrompt = `educational diagram of ${cleanPrompt}, white background, scientific illustration, labeled, textbook style, high quality`;

        // Using flux-pro for better diagrams if available, otherwise standard flux
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&model=flux&nologo=1`;
    }
}
