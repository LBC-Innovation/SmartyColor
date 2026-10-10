# SmartyColor

SmartyColor helps kids describe something they want to color, refine the idea together, and print a coloring sheet of their own invention.

## Product flow

1. Chat with Smarty about your idea (type or speak). Set printer options anytime from the header.
2. Review and edit the list of drawing details until it feels right.
3. Press **Make It** — the sheet builds on a curtain overlay on the same page.
4. Download the PDF, reopen past versions from the plan sidebar, or continue editing with Smarty.

**From a photo** (`/photo`): upload a picture up to 8 MB from your device (JPG, PNG, WebP, or **HEIC** from iPhone); the app converts and shrinks it as needed so requests stay within Vercel’s body limit. Photos are processed in memory only (not stored server-side). You see the photo beside the coloring sheet and can send up to three short fix notes for a single follow-up redraw — no long chat loop.

Guest use is fully supported. Sign in with Supabase if you want to reopen past sheets.

## Stack

- Next.js on Vercel
- Tailwind CSS
- Gemini behind an AI provider facade
- Optional Supabase auth and storage

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `GOOGLE_GENERATIVE_AI_API_KEY` for live drawings. Without it, a local sample page is used so the flow can still be clicked through.

To save accounts and past prints, create a Supabase project, add the URL and anon key, and run `supabase/migrations/0001_init.sql`.
