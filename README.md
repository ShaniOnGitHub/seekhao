# seekhao

> **Practice the interview you want. Speak your answer. Leave with a clearer way to improve.**

[**Try Seekhao live →**](https://seekhao.onrender.com)

Seekhao is a voice-first AI interview coach for technical candidates. It gives you a realistic practice room, asks role-relevant questions, listens to your spoken answers, and turns each response into practical coaching you can use in the next round.

## Why Seekhao

Interview preparation is more useful when it feels like an interview rather than a worksheet. Seekhao helps you practice the parts that are hardest to rehearse alone: thinking out loud, explaining trade-offs, staying structured under pressure, and turning experience into a clear answer.

You can practice with the role you are targeting, bring the context from your resume, and get feedback on the answer you actually gave—not a generic sample response.

## What you can do

| Experience | What it gives you |
|---|---|
| **Role-aware practice** | Questions shaped around the role you are preparing for, from AI engineering and data to product and design. |
| **Resume-informed prompts** | Your resume gives the practice session useful context, so questions can connect to your experience. |
| **Voice-first answers** | Speak naturally instead of typing polished answers. The session is designed around real interview behavior. |
| **Transcription and coaching** | Review what you said and receive concise feedback on clarity, depth, structure, and technical reasoning. |
| **Progressive practice** | Continue through a full round of questions instead of stopping after a single prompt. |
| **End-of-session report** | Finish with a summary of strengths, opportunities, and practical next steps for your next practice round. |

## A session in four steps

1. **Choose your target.** Sign in, enter your name and target role, and optionally add your resume.
2. **Answer out loud.** Seekhao asks a role-relevant question and gives you a focused practice room for your response.
3. **Get useful feedback.** Your spoken answer is transcribed and evaluated so you can see what worked and what to make sharper.
4. **Try again with intent.** Continue through the round, then use the final report to decide what to practice next.

## Built for repeat practice

Strong interview performance comes from deliberate repetition, not memorizing one perfect script. Seekhao uses a curated question bank with varied framing and anti-repetition behavior so repeated sessions stay useful instead of feeling like the same quiz every time.

The goal is not to replace your voice with an AI-generated answer. The goal is to help **your** reasoning become easier to hear.

## Technology glimpse

Seekhao is a full-stack web application with a React and Vite client, an Express and tRPC server, Firebase Authentication, browser audio capture, speech transcription, and AI-powered evaluation. The interface is responsive and designed for direct use on desktop and mobile browsers.

The repository also includes automated coverage for interview routing, question selection, transcription fallbacks, authentication behavior, and structured AI-response resilience.

## Run locally

### Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- Firebase web configuration for Google sign-in
- OpenRouter credentials for AI evaluation
- Groq credentials for speech transcription

### Setup

```bash
git clone https://github.com/ShaniOnGitHub/seekhao.git
cd seekhao
pnpm install
```

Create a local `.env` file with the Firebase, AI, and transcription variables used by your deployment. Do not commit secrets.

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and start a practice session.

## Quality checks

```bash
pnpm check
pnpm test
pnpm build
```

## Project shape

```text
client/   The candidate-facing practice experience
server/   Interview procedures, AI evaluation, transcription, and storage
shared/   Types and shared application contracts
scripts/  Repeatable end-to-end validation
```

## Privacy-minded by default

Resume and answer data should be treated as sensitive. Keep credentials out of source control, configure only the services you intend to use, and review your deployment’s retention settings before using real candidate material.

## Status

Seekhao is actively evolving. The live experience is available at [seekhao.onrender.com](https://seekhao.onrender.com), and the source is maintained in this repository.

## License

No license has been declared yet. If you plan to publish or accept outside contributions, add the license that matches how you want Seekhao to be used.
