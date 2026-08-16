// Simulates the exact Vercel serverless invocation conditions.
process.env.NODE_ENV = "production";
process.env.GROQ_API_KEY = "gsk_test";
process.env.VITE_FIREBASE_API_KEY = "k";
process.env.VITE_FIREBASE_AUTH_DOMAIN = "d";
process.env.VITE_FIREBASE_PROJECT_ID = "p";
process.env.VITE_FIREBASE_APP_ID = "a";

import { handler } from "../api/trpc";

async function main() {
  const req = new Request("http://x/api/trpc/interview.start?batch=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      "0": {
        json: {
          name: "shani",
          role: "ai engineer",
          resume: {
            name: "r.pdf",
            text: "engineer with LLM and automation experience, python, typescript, aws",
          },
        },
      },
    }),
  });
  try {
    const res = await handler(req);
    const txt = await res.text();
    console.log("status:", res.status, "body:", txt.slice(0, 400));
  } catch (e: any) {
    console.log("THROWN:", e?.message, "\nstack:", e?.stack?.slice(0, 600));
  }
}

void main();
