
/**
 * Utility for safe chunking and cleaning of large text strings
 */
export const MAX_ANALYSIS_CHARS = 50000; // ~15-20 pages max for stability

export const cleanAndNormalizeText = (text: string): string => {
    return text
        .replace(/\\t/g, ' ')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\s{3,}/g, ' ')
        .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters
        .trim();
};

export const splitIntoChunks = (text: string, chunkSize: number = 6000): string[] => {
    const chunks: string[] = [];
    if (!text) return chunks;

    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
};

export const extractStrictJSON = (text: string): any => {
    try {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        if (start === -1 || end === -1) return null;

        const jsonStr = text.substring(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("JSON Extraction Error:", error);
        return null;
    }
};
