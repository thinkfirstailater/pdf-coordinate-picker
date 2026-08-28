import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function buildPrompt(origin: string) {
  return `You are a PDF form analyzer. I will give you text items extracted from ONE page of a PDF form with coordinates.

Your task: Identify ONLY the fillable form fields — fields that a user needs to input data into (text inputs, checkboxes, date fields, signature areas).

Return ONLY a valid JSON array, no explanation, no markdown fences:

[
  { "label": "Họ và tên/ Full name", "type": "text", "x": 200, "y": 616.21 },
  { "label": "Cá nhân/ Individual", "type": "checkbox", "x": 180, "y": 580 }
]

Field types: "text", "checkbox", "date", "signature"

Rules:
- x, y = the position of the input area where value should be filled, NOT the label position
- Merge bilingual labels (VN/EN) into one (e.g. "Họ và tên/ Full name")
- Only return fillable fields. Skip headers, instructions, company info, decorations
- Estimate input position based on layout context (usually to the right of or below the label)
- Coordinate system: PDF points, origin ${origin}
- The extracted text items below use origin bottom-left. You MUST convert x, y in your response to origin ${origin}.

Here is the extracted data:
`;
}

interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AutoPickResult {
  label: string;
  type: string;
  x: number;
  y: number;
}

function isValidServerKey(key: string | undefined): key is string {
  return !!key && key.trim().length > 0;
}

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const hasServerKey = isValidServerKey(apiKey);
  const serverModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return NextResponse.json({ hasServerKey, serverModel });
}

export async function POST(request: NextRequest) {
  const headerKey = request.headers.get("x-api-key")?.trim();
  const serverKey = process.env.GOOGLE_AI_API_KEY;
  const apiKey =
    headerKey ||
    (isValidServerKey(serverKey) ? serverKey : null);

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Google AI API Key is required. Please provide a key in settings or configure GOOGLE_AI_API_KEY on the server.",
        code: "API_KEY_REQUIRED",
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { items, page, pageWidth, pageHeight, origin = "bottom-left", model } = body as {
      items: TextItem[];
      page: number;
      pageWidth: number;
      pageHeight: number;
      origin?: string;
      model?: string;
    };

    if (!items?.length) {
      return NextResponse.json(
        { error: "No text items provided" },
        { status: 400 }
      );
    }

    const activeModel = model || process.env.GEMINI_MODEL || DEFAULT_MODEL;

    const pageContext = JSON.stringify(
      { page, width: pageWidth, height: pageHeight, items },
      null,
      2
    );

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: buildPrompt(origin) + pageContext,
    });
    const responseText = response.text ?? "";

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw: responseText },
        { status: 500 }
      );
    }

    const fields: AutoPickResult[] = JSON.parse(jsonMatch[0]);

    const validated = fields
      .filter(
        (f) =>
          typeof f.label === "string" &&
          typeof f.x === "number" &&
          typeof f.y === "number"
      )
      .map((f) => ({
        label: f.label,
        type: f.type || "text",
        page,
        x: f.x,
        y: f.y,
      }));

    return NextResponse.json({ fields: validated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
