# Gemini Model Configuration & BYOK Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Google AI SDK to `@google/genai`, add `GEMINI_MODEL` env support on server, and add lazy-fetch model selector in ApiKeyModal for BYOK users.

**Architecture:** Server reads `GEMINI_MODEL` env (fallback `gemini-3.5-flash-lite`) and accepts `model` override in POST body for BYOK. A new `/api/models` GET route fetches and filters `generateContent`-capable models using the new SDK. Client adds a lazy-fetch dropdown in `ApiKeyModal` that only calls `/api/models` when user opens the dropdown.

**Tech Stack:** Next.js 14 App Router, `@google/genai` (replaces `@google/generative-ai`), TypeScript, React, localStorage for persistence.

## Global Constraints

- Default model fallback: `"gemini-3.5-flash-lite"` (exact string, everywhere)
- Remove `@google/generative-ai` completely — no mixed imports
- Model selector visible **only** when `isBYOK` (key input has a value)
- Lazy fetch: do NOT call `/api/models` on modal open — only on dropdown open
- Filter models: only those whose `supportedActions` includes `"generateContent"`
- Persist both key and model in localStorage keys: `"google_ai_api_key"` and `"google_ai_model"`

---

### Task 1: SDK Migration — install `@google/genai` and update `route.ts`

**Files:**
- Modify: `package.json`
- Modify: `src/app/api/auto-pick/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `GET /api/auto-pick` returns `{ hasServerKey: boolean, serverModel: string }`
- Produces: `POST /api/auto-pick` accepts optional `model?: string` in JSON body

- [ ] **Step 1: Install new SDK, remove old**

```bash
npm install @google/genai
npm uninstall @google/generative-ai
```

- [ ] **Step 2: Update `route.ts` — rewrite imports and model initialization**

Replace the entire `route.ts` with the migrated version:

```typescript
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
  return !!key && key !== "your_google_studio_api_key_here" && key !== "your_google_ai_api_key_here";
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
```

- [ ] **Step 3: Update `.env.example`**

Add `GEMINI_MODEL` entry after `GOOGLE_AI_API_KEY`:

```
# (Optional) Google AI API Key for default server-side AI Auto-Pick
# If not configured, users can supply their own API key directly in the web UI.
# Get a free key at: https://aistudio.google.com/apikey
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# (Optional) Gemini model to use for server-side AI Auto-Pick
# If not configured, defaults to gemini-3.5-flash-lite
# See available models: https://ai.google.dev/gemini-api/docs/models
GEMINI_MODEL=gemini-3.5-flash-lite
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -50
```

Expected: no TypeScript errors related to `@google/genai` or `@google/generative-ai`.

- [ ] **Step 5: Manual smoke test**

```bash
# Start dev server
npm run dev
```

Open browser → `http://localhost:3000/api/auto-pick` (GET) → should return:
```json
{ "hasServerKey": false, "serverModel": "gemini-3.5-flash-lite" }
```

If you have `GEMINI_MODEL=gemini-2.0-flash` in `.env.local`:
```json
{ "hasServerKey": false, "serverModel": "gemini-2.0-flash" }
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/api/auto-pick/route.ts .env.example
git commit -m "feat: migrate to @google/genai SDK and add GEMINI_MODEL env support"
```

---

### Task 2: New `/api/models` GET route

**Files:**
- Create: `src/app/api/models/route.ts`

**Interfaces:**
- Consumes: `@google/genai` installed in Task 1
- Produces: `GET /api/models` with header `X-API-Key: <key>` returns `{ models: [{ name: string, displayName: string }] }`
- Error: `{ error: string }` with status 400 (no key) or 500 (API error)

- [ ] **Step 1: Create `src/app/api/models/route.ts`**

```typescript
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
```

- [ ] **Step 2: Manual smoke test**

```bash
# Replace YOUR_KEY with a real Google AI API key
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/models
```

Expected response shape:
```json
{
  "models": [
    { "name": "gemini-3.5-flash-lite", "displayName": "Gemini 3.5 Flash Lite" },
    { "name": "gemini-2.0-flash", "displayName": "Gemini 2.0 Flash" }
  ]
}
```

Test missing key:
```bash
curl http://localhost:3000/api/models
```
Expected: `{ "error": "X-API-Key header is required" }` with status 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/models/route.ts
git commit -m "feat: add /api/models route with generateContent filter"
```

---

### Task 3: Client — model state, localStorage persistence, autoPick update

**Files:**
- Modify: `src/components/PDFCoordinatePicker.tsx` (state and autoPick logic only — UI in Task 4)

**Interfaces:**
- Consumes: `GET /api/auto-pick` now returns `serverModel` (Task 1)
- Consumes: `POST /api/auto-pick` accepts `model?: string` in body (Task 1)
- Produces: `userModel: string` state available to pass to `ApiKeyModal` in Task 4
- Produces: `autoPick()` sends `model` in POST body when BYOK

- [ ] **Step 1: Add `userModel` state and load from localStorage**

Find the block around line 110 where `userApiKey` state is declared:
```typescript
const [userApiKey, setUserApiKey] = useState("");
const [hasServerKey, setHasServerKey] = useState(false);
const [showApiKeyModal, setShowApiKeyModal] = useState(false);
```

Add `userModel` state after `userApiKey`:
```typescript
const [userApiKey, setUserApiKey] = useState("");
const [userModel, setUserModel] = useState("gemini-3.5-flash-lite");
const [hasServerKey, setHasServerKey] = useState(false);
const [showApiKeyModal, setShowApiKeyModal] = useState(false);
```

- [ ] **Step 2: Load `userModel` from localStorage in the existing `useEffect`**

Find the existing useEffect around line 120 that loads the saved key:
```typescript
useEffect(() => {
  try {
    const savedKey = localStorage.getItem("google_ai_api_key") || "";
    if (savedKey) setUserApiKey(savedKey);
  } catch {
    // localStorage may be unavailable
  }
  ...
```

Add the model load inside the same try block:
```typescript
useEffect(() => {
  try {
    const savedKey = localStorage.getItem("google_ai_api_key") || "";
    if (savedKey) setUserApiKey(savedKey);
    const savedModel = localStorage.getItem("google_ai_model") || "";
    if (savedModel) setUserModel(savedModel);
  } catch {
    // localStorage may be unavailable
  }
  ...
```

- [ ] **Step 3: Update `autoPick()` to send `model` when using BYOK**

Find in `autoPick()` the body of the fetch POST call (around line 412):
```typescript
body: JSON.stringify({
  items,
  page: currentPage,
  pageWidth: pageSize.width,
  pageHeight: pageSize.height,
  origin,
}),
```

Replace with (include `model` only when using BYOK):
```typescript
body: JSON.stringify({
  items,
  page: currentPage,
  pageWidth: pageSize.width,
  pageHeight: pageSize.height,
  origin,
  ...(activeKey && !hasServerKey ? { model: userModel } : {}),
}),
```

Also add `userModel` to the `autoPick` `useCallback` dependency array:
```typescript
[fileUrl, isAutoPicking, pageSize, userApiKey, userModel, hasServerKey, currentPage, origin]
```

- [ ] **Step 4: Update the `onSave` call sites to handle new signature**

The `ApiKeyModal.onSave` will be updated in Task 4 to `(key: string, model: string, remember: boolean, andAutoPick?: boolean) => void`. Update the call site in `PDFCoordinatePicker` where `ApiKeyModal` is rendered (there are 2 instances — upload screen and main screen). Find:

```typescript
onSave={(key, remember) => {
  setUserApiKey(key);
  try {
    if (remember && key) {
      localStorage.setItem("google_ai_api_key", key);
    } else {
      localStorage.removeItem("google_ai_api_key");
    }
  } catch {
    // ignore storage error
  }
  setShowApiKeyModal(false);
}}
```

Replace both instances with:
```typescript
onSave={(key, model, remember) => {
  setUserApiKey(key);
  setUserModel(model);
  try {
    if (remember && key) {
      localStorage.setItem("google_ai_api_key", key);
      localStorage.setItem("google_ai_model", model);
    } else {
      localStorage.removeItem("google_ai_api_key");
      localStorage.removeItem("google_ai_model");
    }
  } catch {
    // ignore storage error
  }
  setShowApiKeyModal(false);
}}
```

- [ ] **Step 5: Pass `currentModel` and `serverModel` props to `ApiKeyModal`**

Find all `<ApiKeyModal` usages and add the new props:
```tsx
<ApiKeyModal
  isOpen={showApiKeyModal}
  onClose={() => setShowApiKeyModal(false)}
  currentKey={userApiKey}
  currentModel={userModel}
  hasServerKey={hasServerKey}
  onSave={(key, model, remember) => {
    ...
  }}
/>
```

- [ ] **Step 6: Verify no TypeScript errors**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/PDFCoordinatePicker.tsx
git commit -m "feat: add userModel state and send model in autoPick POST body"
```

---

### Task 4: Client — `ApiKeyModal` model selector UI with lazy fetch

**Files:**
- Modify: `src/components/PDFCoordinatePicker.tsx` (`ApiKeyModal` component only)

**Interfaces:**
- Consumes: `GET /api/models` (Task 2) with `X-API-Key` header
- Consumes: `currentModel: string` prop (Task 3)
- Consumes: `onSave(key: string, model: string, remember: boolean, andAutoPick?: boolean)` signature (Task 3)

- [ ] **Step 1: Update `ApiKeyModal` props interface**

Find the `ApiKeyModal` function definition (around line 1195):
```typescript
function ApiKeyModal({
  isOpen,
  onClose,
  currentKey,
  hasServerKey,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  hasServerKey: boolean;
  onSave: (key: string, remember: boolean, andAutoPick?: boolean) => void;
})
```

Replace with:
```typescript
function ApiKeyModal({
  isOpen,
  onClose,
  currentKey,
  currentModel,
  hasServerKey,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  currentModel: string;
  hasServerKey: boolean;
  onSave: (key: string, model: string, remember: boolean, andAutoPick?: boolean) => void;
})
```

- [ ] **Step 2: Add model-related state inside `ApiKeyModal`**

Find where `ApiKeyModal` local state is declared:
```typescript
const [keyInput, setKeyInput] = useState(currentKey);
const [showPlain, setShowPlain] = useState(false);
const [remember, setRemember] = useState(true);
```

Add model state below:
```typescript
const [keyInput, setKeyInput] = useState(currentKey);
const [modelInput, setModelInput] = useState(currentModel);
const [showPlain, setShowPlain] = useState(false);
const [remember, setRemember] = useState(true);
const [modelList, setModelList] = useState<{ name: string; displayName: string }[]>([]);
const [modelListOpen, setModelListOpen] = useState(false);
const [modelListLoading, setModelListLoading] = useState(false);
const [modelListError, setModelListError] = useState<string | null>(null);
```

- [ ] **Step 3: Add `fetchModels` function inside `ApiKeyModal`**

Add this function inside the component body (before the `if (!isOpen) return null` guard):

```typescript
async function fetchModels(key: string) {
  if (!key.trim()) return;
  setModelListLoading(true);
  setModelListError(null);
  try {
    const res = await fetch("/api/models", {
      headers: { "X-API-Key": key.trim() },
    });
    const data = await res.json();
    if (!res.ok) {
      setModelListError(data.error ?? "Failed to fetch models");
      setModelList([]);
    } else {
      setModelList(data.models ?? []);
    }
  } catch {
    setModelListError("Network error — check your API key and connection");
    setModelList([]);
  } finally {
    setModelListLoading(false);
  }
}
```

- [ ] **Step 4: Add model selector UI section inside the Content Body `<div>`**

Find the `{/* Remember Option */}` section in the modal body. Insert the model selector **above** it (only when `keyInput` has a value):

```tsx
{/* Model Selector — only shown when user has a key (BYOK) */}
{keyInput.trim() && (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <label style={{ fontSize: "12px", fontWeight: 600, color: "#d2d8eb", letterSpacing: "0.01em" }}>
      Gemini Model
    </label>

    {/* Custom dropdown trigger */}
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          const opening = !modelListOpen;
          setModelListOpen(opening);
          if (opening && modelList.length === 0 && !modelListLoading) {
            fetchModels(keyInput);
          }
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#090c14",
          border: "1px solid #273047",
          borderRadius: "12px",
          padding: "11px 14px",
          color: "#ffffff",
          fontSize: "13px",
          fontFamily: "ui-monospace, monospace",
          cursor: "pointer",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
        }}
      >
        <span>{modelInput || "gemini-3.5-flash-lite"}</span>
        <span style={{ color: "#8d96ae", fontSize: "11px" }}>
          {modelListLoading ? "⏳" : "▾"}
        </span>
      </button>

      {/* Dropdown list */}
      {modelListOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "#0d1120",
            border: "1px solid #273047",
            borderRadius: "12px",
            zIndex: 10,
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {modelListLoading && (
            <div style={{ padding: "12px 14px", color: "#8d96ae", fontSize: "12px" }}>
              Fetching models...
            </div>
          )}
          {modelListError && (
            <div style={{ padding: "12px 14px", color: "#f87171", fontSize: "12px" }}>
              {modelListError}
            </div>
          )}
          {!modelListLoading && !modelListError && modelList.length === 0 && (
            <div style={{ padding: "12px 14px", color: "#8d96ae", fontSize: "12px" }}>
              No models found
            </div>
          )}
          {modelList.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => {
                setModelInput(m.name);
                setModelListOpen(false);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: modelInput === m.name ? "rgba(124, 108, 255, 0.15)" : "transparent",
                border: "none",
                color: modelInput === m.name ? "#a599ff" : "#c8d0e5",
                fontSize: "13px",
                fontFamily: "ui-monospace, monospace",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ fontWeight: modelInput === m.name ? 600 : 400 }}>{m.name}</span>
              {m.displayName && m.displayName !== m.name && (
                <span style={{ marginLeft: "8px", fontSize: "11px", color: "#5d6880" }}>
                  {m.displayName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>

    <p style={{ margin: 0, fontSize: "11px", color: "#5d6880" }}>
      Click to load available models. Default: gemini-3.5-flash-lite
    </p>
  </div>
)}
```

- [ ] **Step 5: Update footer "Save & Apply" button to pass `modelInput`**

Find in the modal footer:
```tsx
onClick={() => onSave(keyInput.trim(), remember, true)}
```

Replace with:
```tsx
onClick={() => onSave(keyInput.trim(), modelInput || "gemini-3.5-flash-lite", remember, true)}
```

Also update the "Clear Saved Key" handler:
```tsx
onClick={() => {
  setKeyInput("");
  onSave("", "gemini-3.5-flash-lite", false, false);
}}
```

- [ ] **Step 6: Close dropdown when clicking outside**

Add a `useEffect` inside `ApiKeyModal` to close the dropdown on outside click:

```typescript
useEffect(() => {
  if (!modelListOpen) return;
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-model-dropdown]")) {
      setModelListOpen(false);
    }
  }
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, [modelListOpen]);
```

Then add `data-model-dropdown` attribute to the dropdown wrapper `<div style={{ position: "relative" }}>`:
```tsx
<div style={{ position: "relative" }} data-model-dropdown="">
```

- [ ] **Step 7: Build check**

```bash
npm run build 2>&1 | grep -E "error TS|Error"
```

Expected: no errors.

- [ ] **Step 8: Manual end-to-end test**

1. Start dev server: `npm run dev`
2. Open `http://localhost:3000`
3. Click "Configure AI Key" button
4. Enter a valid Google AI API key in the input field
5. Verify: model selector appears below the key input
6. Verify: default shows `gemini-3.5-flash-lite`
7. Click the dropdown — verify spinner appears, then model list populates
8. Select a different model (e.g., `gemini-2.0-flash`)
9. Click "Save & Apply"
10. Open ApiKeyModal again — verify selected model is still `gemini-2.0-flash`
11. Reload page — verify model is restored from localStorage
12. Upload a PDF and click "Auto Pick" — verify it uses the selected model (check network tab, POST body should have `{ "model": "gemini-2.0-flash", ... }`)

- [ ] **Step 9: Commit**

```bash
git add src/components/PDFCoordinatePicker.tsx
git commit -m "feat: add BYOK model selector with lazy-fetch to ApiKeyModal"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `GEMINI_MODEL` env with fallback → Task 1 `route.ts`
- [x] SDK migration `@google/generative-ai` → `@google/genai` → Task 1
- [x] `/api/models` GET route with `generateContent` filter → Task 2
- [x] `userModel` state + localStorage persistence → Task 3
- [x] `autoPick()` sends `model` in body for BYOK → Task 3
- [x] Model selector in `ApiKeyModal`, BYOK-only → Task 4
- [x] Lazy fetch on dropdown open → Task 4
- [x] Error handling when `/api/models` fails → Task 4 (inline error in dropdown)
- [x] `.env.example` updated → Task 1

**Type consistency:**
- `onSave(key: string, model: string, remember: boolean, andAutoPick?: boolean)` — defined in Task 3, consumed in Task 3 (call sites) and Task 4 (modal)
- `modelList: { name: string; displayName: string }[]` — produced by Task 2, consumed by Task 4
- `serverModel: string` — produced by Task 1 GET, not currently consumed client-side (acceptable — available if needed later)
