# Contributing to PDF Coordinate Picker

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- A Google AI API key ([get one here](https://aistudio.google.com/apikey)) — needed only for the AI Auto-Pick feature

### Setup

```bash
# Clone the repo
git clone https://github.com/thinkfirstailater/pdf-coordinate-picker.git
cd pdf-coordinate-picker

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local and add your GOOGLE_AI_API_KEY

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How to Contribute

### Reporting Bugs

- Use the [Bug Report](https://github.com/thinkfirstailater/pdf-coordinate-picker/issues/new?template=bug_report.md) template
- Include steps to reproduce, expected vs actual behavior
- Attach a screenshot if it's a visual issue

### Suggesting Features

- Use the [Feature Request](https://github.com/thinkfirstailater/pdf-coordinate-picker/issues/new?template=feature_request.md) template
- Describe the use case, not just the solution

### Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `npm run build` passes
4. Ensure `npm run lint` passes
5. Open a PR with a clear description

### Code Style & Security Rules

- TypeScript with strict mode
- React functional components with hooks
- Tailwind CSS v4 for styling
- Follow existing patterns in the codebase
- **Zero-Log Policy for Secrets/Keys**: NEVER log, persist, or expose user API keys in console outputs, server logs, or error responses. All user keys must remain stateless and client-isolated.

## Project Structure

```
src/
├── app/
│   ├── api/auto-pick/    # AI auto-pick API route (Gemini)
│   ├── globals.css        # Design tokens & global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
└── components/
    └── PDFCoordinatePicker.tsx  # Main component (all UI logic)
```

## Need Help?

Open an issue with the `question` label or start a discussion. We're happy to help!
