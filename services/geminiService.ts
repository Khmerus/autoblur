
import { GoogleGenAI, Type } from "@google/genai";
import { DetectionResult } from "../types";

export async function detectLicensePlates(base64Image: string): Promise<DetectionResult[]> {
  // Use the API key exclusively from process.env.API_KEY as per the library guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: `Detect all license plates in this image. Return ONLY a JSON array of objects with 'box_2d' [ymin, xmin, ymax, xmax] (0-1000) and 'label'.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
              label: {
                type: Type.STRING,
              }
            },
            required: ["box_2d", "label"]
          }
        }
      },
    });

    // Access the .text property directly to retrieve the generated string
    const resultText = response.text;
    if (!resultText) return [];
    
    return JSON.parse(resultText) as DetectionResult[];
  } catch (error) {
    console.error("Error detecting license plates:", error);
    throw error;
  }
}
