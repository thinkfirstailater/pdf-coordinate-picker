# API Key Fallback System — Design Spec

**Date**: 2026-08-26
**Status**: Approved

## Goal

Allow the AI Auto-Pick feature to work in two modes:
1. **Server key mode**: Server has `GOOGLE_AI_API_KEY` in env → users get AI features without any setup
2. **User key mode**: Server has no key → user provides their own Google AI API key via the UI

Priority: server env key > user-provided key via header. If user provides a key, it overrides the server key (stateless — sent per request, never stored server-side).

## Architecture

### API Changes (`src/app/api/auto-pick/route.ts`)

**New GET handler** — status endpoint:
```ts
GET /api/auto-pick → { hasServerKey: boolean }
```
- Returns `true` if `process.env.GOOGLE_AI_API_KEY` is set and non-placeholder
- Does NOT expose the actual key value

**Modified POST handler** — key resolution:
```
1. Read `x-api-key` header from request
2. Read `process.env.GOOGLE_AI_API_KEY`
3. Use header key if present, otherwise env key
4. If neither exists → return 400 with clear error message
```

**Security rules**:
- NEVER log, print, or include API keys in error responses
- Key from header is used in-memory only, garbage collected after request
- Error response for missing key includes instructions on how to provide one

### Frontend Changes (`src/components/PDFCoordinatePicker.tsx`)

**New state**:
- `userApiKey: string` — loaded from `localStorage.getItem('google_ai_api_key')` on mount
- `hasServerKey: boolean` — fetched from `GET /api/auto-pick` on mount  
- `showApiKeyModal: boolean` — controls modal visibility

**Key resolution flow** (when user clicks Auto Pick):
```
1. Determine effectiveKey:
   - If hasServerKey && !userApiKey → use server key (don't send header)
   - If userApiKey → send via X-API-Key header (overrides server)
   - If !hasServerKey && !userApiKey → show modal, abort
2. Proceed with API call
```

**Status indicator** (next to Auto Pick button):
- Green dot + "Server Key" → server has key configured
- Blue dot + "Your Key" → using user-provided key
- No indicator → no key available (modal will show on click)

**API Key Modal**:
- Input field: `Google AI API Key` (password type, with toggle visibility)
- Link: "Get a free key at aistudio.google.com/apikey"
- Checkbox: "Remember this key" (saves to localStorage; unchecked = session only via state)
- Privacy notice: "🔒 Your API key is stored only in your browser. The server does not log or store any user API keys."
- Buttons: Cancel, Save & Continue
- On save: stores key, closes modal, triggers auto-pick automatically

### Privacy Policy Updates

**README.md** — add "Privacy & Security" section:
```
- API keys provided by users are stored in browser localStorage only
- The server processes keys in-memory and never logs or persists them
- No analytics or tracking of API key usage
```

**CONTRIBUTING.md** — add rule:
```
- NEVER add console.log, logging, or persistence for API keys
```

**Frontend modal** — inline notice (shown in modal UI).

## File Changes

| File | Action | Description |
|---|---|---|
| `src/app/api/auto-pick/route.ts` | MODIFY | Add GET handler; modify POST to read `X-API-Key` header; ensure zero logging of keys |
| `src/components/PDFCoordinatePicker.tsx` | MODIFY | Add key state, status fetch, modal component, status indicator, modified autoPick flow |
| `README.md` | MODIFY | Add "Privacy & Security" section |
| `CONTRIBUTING.md` | MODIFY | Add API key security rule |
| `.env.example` | MODIFY | Add comment clarifying optional nature |

## Verification

- Build passes (`npm run build`)
- With server key: Auto Pick works without user input, shows "Server Key" indicator
- Without server key: clicking Auto Pick shows modal, after entering key it works
- User key in localStorage persists across page reloads
- No API key values appear in server logs or error responses
- Privacy notice visible in modal and README
