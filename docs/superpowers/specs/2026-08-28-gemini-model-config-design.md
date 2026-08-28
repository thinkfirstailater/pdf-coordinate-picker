# Gemini Model Configuration & BYOK Model Selector

**Date:** 2026-08-28  
**Status:** Approved  

## Overview

Hiện tại `gemini-3.5-flash-lite` đang được hardcode trong server route. Feature này:

1. **Server**: Cho phép khai báo `GEMINI_MODEL` env để cấu hình model động; fallback về `gemini-3.5-flash-lite` nếu không có.
2. **Client**: Khi user dùng BYOK (Bring Your Own Key), hiện model selector trong `ApiKeyModal`; lazy-fetch danh sách model từ Google API khi user mở dropdown.
3. **SDK migration**: Migrate từ deprecated `@google/generative-ai` sang `@google/genai` (SDK unified mới của Google).

## Architecture

```
Server
├── GET /api/auto-pick  → { hasServerKey, serverModel }
├── POST /api/auto-pick → body { items, model?, ... }
│     Dùng: model (từ body) || GEMINI_MODEL env || "gemini-3.5-flash-lite"
└── GET /api/models     → nhận X-API-Key header
      Gọi ai.models.list(), filter generateContent support
      Trả về: { models: [{ name, displayName }] }

Client (ApiKeyModal)
├── Key input (hiện tại)
├── Model selector dropdown [MỚI — chỉ hiện khi isBYOK]
│   ├── Default hiển thị: "gemini-3.5-flash-lite" (không fetch ngay)
│   └── Lazy fetch: user click dropdown → call GET /api/models
└── localStorage: lưu "google_ai_api_key" + "google_ai_model"
```

## User Flow — Model Selector

```
User opens ApiKeyModal với BYOK key
  → Hiện model selector, default = "gemini-3.5-flash-lite"
  → User click vào dropdown
  → Spinner + fetch /api/models (X-API-Key: <userKey>)
  → Populate dropdown với models có generateContent support
  → User chọn model
  → Save & Apply lưu cả key + model vào localStorage
  → autoPick() gửi { model: selectedModel } trong POST body
```

## Files

### [MODIFY] `package.json`
- Remove `@google/generative-ai`
- Add `@google/genai` (latest)

### [MODIFY] `src/app/api/auto-pick/route.ts`
- Import `GoogleGenAI` từ `@google/genai` thay vì `@google/generative-ai`
- `GET`: trả thêm `serverModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"`
- `POST`: đọc `model` từ body; resolve `activeModel = body.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"`; dùng SDK mới để generate

### [NEW] `src/app/api/models/route.ts`
- `GET /api/models`: nhận `X-API-Key` header
- Dùng `@google/genai` `ai.models.list()` với key đó
- Filter: chỉ giữ model có `supportedActions` hoặc `supportedGenerationMethods` chứa `generateContent`
- Trả `{ models: [{ name: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite" }] }`
- Nếu không có key → 400; nếu key invalid → proxy lỗi từ Google API

### [MODIFY] `src/components/PDFCoordinatePicker.tsx`
- Thêm state `userModel: string` (default `"gemini-3.5-flash-lite"`)
- Load/save `google_ai_model` từ localStorage cùng với key
- Truyền `userModel` vào `ApiKeyModal`
- `autoPick()`: gửi `model: isBYOK ? userModel : undefined` trong POST body
- `ApiKeyModal`:
  - Thêm prop `currentModel` và callback `onSave(key, model, remember, andAutoPick?)`
  - Thêm model dropdown với lazy-fetch
  - Dropdown chỉ visible khi `isBYOK` (user đang nhập key)
  - Hiện spinner khi đang fetch list
  - Nếu fetch fail → show error nhỏ, user vẫn có thể gõ model ID thủ công

### [MODIFY] `.env.example`
- Thêm `GEMINI_MODEL=gemini-3.5-flash-lite` với comment giải thích

## Error Handling

| Tình huống | Xử lý |
|---|---|
| `/api/models` fail (key sai, network lỗi) | Hiện inline error trong dropdown, cho nhập tay |
| Body có `model` không hợp lệ | Google API sẽ trả lỗi → route.ts proxy lỗi về client |
| `GEMINI_MODEL` env sai | Lỗi lúc call AI → 500 về client như bình thường |

## Constraints / Notes

- Model dropdown **chỉ hiện khi user đang dùng BYOK** (có nhập key). Khi dùng server key, server quyết định model qua `GEMINI_MODEL` env.
- Lazy fetch: **không fetch list khi mở modal**. Chỉ fetch khi user click mở dropdown.
- Filter API response: chỉ giữ model support `generateContent` (loại embedding, TTS, transcription).
- `@google/generative-ai` sẽ bị xoá hoàn toàn khỏi dependencies.
- SDK mới `@google/genai` sử dụng `new GoogleGenAI({ apiKey })` và `ai.models.generateContent()`.

## Verification Plan

### Automated
- `npm run build` — không có TypeScript errors sau khi migrate SDK
- Kiểm tra `GET /api/auto-pick` trả `serverModel`

### Manual
1. Set `GEMINI_MODEL=gemini-2.0-flash` trong `.env.local` → auto-pick dùng đúng model đó
2. Không set `GEMINI_MODEL` → fallback về `gemini-3.5-flash-lite`
3. Mở ApiKeyModal với BYOK key → hiện model selector default
4. Click dropdown → spinner → list models populate
5. Chọn model khác → Save → auto-pick dùng model đó
6. Reload trang → key + model được restore từ localStorage
