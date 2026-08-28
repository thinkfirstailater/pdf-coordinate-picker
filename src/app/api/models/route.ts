import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key")?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "X-API-Key header is required" },
      { status: 400 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const pager = await ai.models.list();

    const models: { name: string; displayName: string }[] = [];
    for await (const model of pager) {
      const actions: string[] = model.supportedActions ?? [];
      if (actions.includes("generateContent")) {
        // model.name is e.g. "models/gemini-3.5-flash-lite"
        // Strip the "models/" prefix for use as model ID
        const name = model.name?.replace(/^models\//, "") ?? "";
        const displayName = model.displayName ?? name;
        if (name) {
          models.push({ name, displayName });
        }
      }
    }

    // Sort: flash-lite first, then alphabetically
    models.sort((a, b) => {
      if (a.name.includes("flash-lite") && !b.name.includes("flash-lite")) return -1;
      if (!a.name.includes("flash-lite") && b.name.includes("flash-lite")) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
