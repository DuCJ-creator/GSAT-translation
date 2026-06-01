import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Increase JSON and urlencoded limits to support base64 images
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

let aiClient: GoogleGenAI | null = null;

// Lazy initialization of Gemini client
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY variable is missing. Please define it in your AI Studio secrets / environment variables.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// 1. API: Analyze translation prompt
app.post("/api/analyze-prompt", async (req, res) => {
  try {
    const { sentence1, sentence2 } = req.body;
    if (!sentence1 || !sentence2) {
      return res.status(400).json({ error: "Missing Chinese sentences" });
    }

    const ai = getGeminiClient();
    const model = "gemini-3.5-flash";

    const promptText = `Analyze these two contextually or logically connected Chinese sentences for an English translation exercise (suitable for GSAT / 高考 style).
    Chinese Sentence 1: "${sentence1}"
    Chinese Sentence 2: "${sentence2}"

    Perform a professional syntactic, structural and vocabulary analysis:
    1. Identify key translation structures and grammar patterns for each sentence.
    2. Extract key vocabulary/phrases with their English translations and brief teacher notes.
    3. Pinpoint key translation difficulties and requirements (Keys to Fulfilling).
    4. Provide 3 high-quality reference translations for Sentence 1, ranging from standard/faithful to advanced/polished.
    5. Provide 3 high-quality reference translations for Sentence 2, similarly.
    6. Formulate overall translation guidelines or keys.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: promptText,
      config: {
        systemInstruction: "You are an elite bilingual English-Chinese teacher in Taiwan who specializes in GSAT (General Scholastic Ability Test) translation assessment. Deliver structured, extremely accurate, and natural analysis.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentence1Chinese: { type: Type.STRING },
            sentence2Chinese: { type: Type.STRING },
            sentence1Analysis: {
              type: Type.OBJECT,
              properties: {
                structures: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                vocabulary: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      translation: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["word", "translation"]
                  }
                },
                keys: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["structures", "vocabulary", "keys"]
            },
            sentence2Analysis: {
              type: Type.OBJECT,
              properties: {
                structures: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                vocabulary: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      translation: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["word", "translation"]
                  }
                },
                keys: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["structures", "vocabulary", "keys"]
            },
            referenceTranslations1: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            referenceTranslations2: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            overallFulfillmentKeys: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: [
            "sentence1Chinese", "sentence2Chinese",
            "sentence1Analysis", "sentence2Analysis",
            "referenceTranslations1", "referenceTranslations2",
            "overallFulfillmentKeys"
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error("No response content from Gemini model.");
    }

    const data = JSON.parse(response.text.trim());
    return res.json(data);
  } catch (error: any) {
    console.error("Error analyzing prompt: ", error);
    return res.status(500).json({ error: error?.message || "Internal Server Error in Analyze Prompt" });
  }
});

// 2. API: Grade student's submission (OCR + Evaluation)
app.post("/api/grade-student", async (req, res) => {
  try {
    const { seatNumber, image, manualText, promptAnalysis } = req.body;

    if (!promptAnalysis) {
      return res.status(400).json({ error: "Missing prompt analysis context for evaluation." });
    }

    const ai = getGeminiClient();
    const model = "gemini-3.5-flash";

    const parts: any[] = [];

    // Add image if attached
    if (image) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    }

    const promptText = `
    You are a professional and seasoned English teacher evaluating a Taiwanese high school student's translation homework for GSAT preparation.
    
    Here is the Chinese prompt:
    Chinese Sentence 1: "${promptAnalysis.sentence1Chinese}"
    Chinese Sentence 2: "${promptAnalysis.sentence2Chinese}"
    
    Model Reference Answers for Guidance:
    Sentence 1 References: ${JSON.stringify(promptAnalysis.referenceTranslations1)}
    Sentence 2 References: ${JSON.stringify(promptAnalysis.referenceTranslations2)}

    Task Instructions:
    1. OCR / Read Content:
       - If there is an image uploaded, transcribe the handwritten English translations for Sentence 1 and Sentence 2 with absolute preservation of spelling, grammar, and typos.
       - Note: If there's a visible number or Seat No. (e.g. "No. 12", "座號 12", "12") on the sheet, extract it as 'detectedSeatNumber'.
       - If no image is provided, or if this is a typed text mode, evaluate this text directly: "${manualText || ''}". Split it into what pertains to Sentence 1 and Sentence 2 in 'ocrSentence1' and 'ocrSentence2'.

    2. Evaluation & GSAT Rubric:
       - Each sentence is worth exactly 4.0 points maximum (Total 8.0 points).
       - General fluency, spelling accuracy, correct word choice, proper preposition, and tense are assessed.
       - Spelling, grammatical mistakes, structural errors generally cost 0.5 points each. Minor punctuation errors can be 0.5 points. Use increments of 0.5 points (possible scores are: 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0).
       - Be professional, highly constructive, encouraging, and detailed. Explain deductions in clear Traditional Chinese.

    3. Structure of output:
       - 'ocrSentence1': Recognized text for Sentence 1.
       - 'ocrSentence2': Recognized text for Sentence 2.
       - 'detectedSeatNumber': Seat number detected in the image, or null.
       - 'score1': Numeric score for Sentence 1 (0 to 4.0 in steps of 0.5).
       - 'score2': Numeric score for Sentence 2 (0 to 4.0 in steps of 0.5).
       - 'totalScore': Sum of score1 and score2 (0 to 8.0).
       - 'errors1': List of errors inside Sentence 1.
       - 'errors2': List of errors inside Sentence 2.
       - 'feedback1': Clear diagnostic explanation for Sentence 1 in Taiwan Traditional Chinese.
       - 'feedback2': Clear diagnostic explanation for Sentence 2 in Taiwan Traditional Chinese.
       - 'improvedVersion': Provide a highly natural, elegant standard bilingual English translation showing the student how to compose it fluidly.
       - 'majorIssues': Broad high-level diagnostic summary of their common problems (e.g. '常規時態結構、冠詞使用疏失、拼字不完整') in Taiwan Traditional Chinese.
    `;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        systemInstruction: "You are an expert GSAT English translation assessor who is naturally encouraging yet strict with Taiwan Ministry of Education standards. Return clear, constructive results in Taiwanese Traditional Chinese.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedSeatNumber: { type: Type.INTEGER },
            ocrSentence1: { type: Type.STRING },
            ocrSentence2: { type: Type.STRING },
            score1: { type: Type.NUMBER },
            score2: { type: Type.NUMBER },
            totalScore: { type: Type.NUMBER },
            errors1: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalSegment: { type: Type.STRING },
                  suggestedSegment: { type: Type.STRING },
                  errorType: { type: Type.STRING, description: "Grammar, Spelling, Word Choice, Structure, or Other" },
                  explanation: { type: Type.STRING },
                  pointsDeducted: { type: Type.NUMBER }
                },
                required: ["originalSegment", "suggestedSegment", "errorType", "explanation", "pointsDeducted"]
              }
            },
            errors2: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalSegment: { type: Type.STRING },
                  suggestedSegment: { type: Type.STRING },
                  errorType: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  pointsDeducted: { type: Type.NUMBER }
                },
                required: ["originalSegment", "suggestedSegment", "errorType", "explanation", "pointsDeducted"]
              }
            },
            feedback1: { type: Type.STRING },
            feedback2: { type: Type.STRING },
            improvedVersion: { type: Type.STRING },
            majorIssues: { type: Type.STRING }
          },
          required: [
            "ocrSentence1", "ocrSentence2",
            "score1", "score2", "totalScore",
            "errors1", "errors2",
            "feedback1", "feedback2",
            "improvedVersion", "majorIssues"
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response from AI engine.");
    }

    const data = JSON.parse(response.text.trim());
    return res.json(data);
  } catch (error: any) {
    console.error("Grading student error: ", error);
    return res.status(500).json({ error: error?.message || "Internal system error during student grading evaluation." });
  }
});

// Setup Vite Dev Server / Static Asset Handler
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with compiled assets...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express API + Vite Asset Gateway is online at http://0.0.0.0:${PORT}`);
  });
}

startServer();
