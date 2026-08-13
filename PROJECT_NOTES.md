# seekho — Project Notes (internal)

## User requirements (from messages)
- App name: **seekho** (replaces old "voice-interview-agent" build)
- Landing page with "Try for free" CTA → Firebase Google sign-in (login OR sign up)
- After sign-up: onboarding asks **name + role applying for** → questions tailored to role (e.g., AI engineering → RAG, LLM, LangChain, multimodal, MCP)
- Below name/role: **resume drop zone** (pdf/txt) → LLM extracts experience → questions tailored to experience or general topics if empty
- After onboarding → straight into question/answer spoken loop
- Transcript text shown as **live subtitles** (subtitle typography) while speech plays
- Theme gradient: #f7f7f7 → #b9a0a0 → #794747 → #4e2020 → #111111
- Font: Poppins, weight 400, lowercase, tracking ~0 to slightly negative
- **No database for now** — Firebase for auth only; sessions in memory
- The prior FastAPI prototype used a separate AI provider. This project deliberately uses the platform’s server-side built-in LLM and Whisper services; no external AI credentials belong in this repository.
- Reference UI screenshots in /home/ubuntu/upload/: (1) dark two-step setup "Tell us about the interview" form (interview type, role, company, language, secondary languages), (2) step 2 resume upload drag-drop, (3) Beyz practice app with mic panel + Answer Suggestion area, (4) "Whinehouse" wordmark over gradient card (the #f7f7f7→...→#111111 gradient with wordmark), (5) Beyz landing page (big headline, purple CTA, social proof).

## Architecture decisions
- New webdev project: /home/ubuntu/seekho (web-static scaffold, React 19 + Tailwind 4 + wouter)
- Dev URL: https://3000-ir8cjk79otwky5ph8fljl-c3cfa9a7.us3.manus.computer
- Keep interview sessions in memory with no application database persistence. Firebase Google sign-in runs client-side, while role-aware LLM generation and Whisper transcription run through server-side built-in services.
- Use the browser SpeechSynthesis API for spoken questions and feedback, with subtitle and replay fallbacks where the embedded preview lacks an audio device or installed browser voices.

## Deliverables so far
- The current seekho project is prepared for delivery to the private GitHub repository: https://github.com/ShaniOnGitHub/voice-interview-agent

## Status
- Phase 1 of new plan: setup scaffold + theme (Poppins, gradient). Next: design brainstorm in ideas.md, then build.
