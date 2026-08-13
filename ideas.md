# seekho — Design Brainstorm

## User-specified constraints (ground truth, binding)
- Brand name: **seekho** (Hindi/Urdu "learn" — "seekho" literally means "learn")
- Color gradient for the UI: #f7f7f7 → #b9a0a0 → #794747 → #4e2020 → #111111
- Font: **Poppins**, weight 400 Regular; tracking ~0 to slightly negative; **lowercase** text throughout
- No database for now; sessions in memory; auth via Google sign-in (Firebase originally requested; we use Manus OAuth which provides Google login, fully free)
- Flow: landing → "try for free" → Google sign-in → onboarding (name + role + resume drop) → interview loop → report
- Interview questions tailored to role (e.g., AI engineer → RAG, LLM, LangChain, multimodal, MCP) and resume experience
- Transcript shown as **live subtitle typography** during speech
- Reference screenshots: Beyz.ai-style landing/onboarding/practice UI; "Whinehouse" wordmark-over-gradient card treatment

## Three approaches (two are overridden; the third direction is shaped by the fixed gradient)

1. **Velvet Studio** — warm dark editorial look leaning on the deep rose/charcoal gradient as cinematic backdrops. Probability: 0.07
2. **Paper & Ink** — light cream surfaces with rose-tinted ink accents, the gradient used only as a narrow accent strip. Probability: 0.02
3. **Dusk Ritual** — the full #f7f7f7→#111111 gradient used as a living background system; UI elements sit like translucent glass on dusk tones; soft serif-free warmth. Probability: 0.08

**Chosen: Dusk Ritual** (user's gradient is the brand; the references are dark UIs with bold lowercase typography, so we commit fully to the dusk palette as an ambient gradient system).

## Chosen approach: Dusk Ritual

**Design Movement:** Contemporary "AI-native product" design (Linear/Figma-like polish) fused with warm dusk editorial — deep rose-browns instead of the usual blue-black SaaS palette. The fixed gradient becomes the brand's atmospheric backdrop; the UI is calm glass on top.

**Core Principles:**
1. The gradient is a living atmosphere, not decoration — every major surface is a translucent layer over the dusk gradient (glassmorphism done sparingly, noise-textured).
2. Lowercase everywhere — the brand speaks softly. All headings, buttons, nav, labels in Poppins 400 lowercase.
3. Warm light = progress; deep dark = focus. The interview stage darkens (#111111 territory) so the user's attention collapses to the mic and the subtitles.
4. Subtitles are a first-class design element — film-caption typography, not a transcript list.

**Color Philosophy:**
- Base atmosphere: the 5-stop gradient. Light end (#f7f7f7) for the landing/hero; dark end (#111111) for the interview stage. Mid-tones (#794747, #4e2020) for accents, progress bars, active states.
- Primary action: warm rose #b9a0a0/#794747 — buttons glow from the mid-gradient, never purple/blue.
- Text on dark: #f0e8e4 (warm off-white); on light: #111111. Muted text: #a78f8a.
- Emotional intent: warm, intimate, encouraging — an interview coach, not a proctor.

**Layout Paradigm:** Asymmetric hero — headline left-weighted, oversized lowercase headline, gradient card wordmark element (like the "Whinehouse" reference) placed as a floating art object right of hero. The interview stage is a three-zone asymmetric layout: question/stage left-center, subtitle band full-width bottom, controls right rail.

**Signature Elements:**
1. The **gradient wordmark card** — a floating rounded card carrying the 5-stop gradient with the seekho wordmark (echoes the Whinehouse reference).
2. **Subtitle band** — film-style caption strip across the bottom of the interview stage with word-by-word highlight.
3. **Pulse mic ring** — concentric warm-rose rings radiating while recording/listening.

**Interaction Philosophy:** Soft, continuous, reassuring. No hard edges or stark popups; state changes dissolve over 200ms; the app narrates its own state in the subtitle band ("listening…", "thinking…", "here's your score").

**Animation:** fade+rise entrances (16px, 240ms, cubic-bezier(0.23,1,0.32,1)); subtitle words highlight in sync with speech via a word-level reveal (fade 120ms each); mic pulse 2s slow ease-in-out scale loop on the ring only; buttons scale(0.97) active 140ms. Respect prefers-reduced-motion.

**Typography System:** Poppins 400 everywhere (user-mandated). Hierarchy via size + weight 500/600 only where needed: headline 64px tight leading, section labels 13px uppercase is BANNED (lowercase rule), use 14px lowercase letter-spaced muted labels. Subtitle band: 24px Poppins 500 warm off-white, max 2 lines.

**Brand Essence:** seekho — a voice-first interview coach that helps you learn out loud, for candidates preparing for technical roles. Personality: warm, patient, encouraging.

**Brand Voice:** lowercase, short, spoken warmth. Examples: "try for free" (CTA); "talk it out. we'll grade the way you think." (headline sub-line). Banned: "Welcome to our website", "Get started today", uppercase labels.

**Wordmark & Logo:** lowercase "seekho" in Poppins 400 with tight negative tracking; the mark is the gradient card chip (gradient card with "seekho" wordmark). Favicon: the gradient chip with an "s" glyph.

**Signature Brand Color:** warm rose #794747 — the unmistakable mid-gradient rose that no blue-purple SaaS competitor uses.

## Pages
- `/` landing (hero gradient wordmark, value props, "try for free")
- `/interview` gated: onboarding (name, role select, resume drop) → stage (spoken Q&A, live subtitles, recorded answers) → report
- Auth gate: Google sign-in (Manus OAuth) before interview access

## Backend strategy
Static webdev project → need server routes for Groq LLM + Whisper. Upgrade to web-db-user to add Express backend + secrets; use Groq API key as a custom secret. TTS via browser SpeechSynthesis (warm English voice selection), subtitles via word-timed caption rendering, recording via MediaRecorder + Groq Whisper on server.
