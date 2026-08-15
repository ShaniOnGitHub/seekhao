// Vercel serverless entry point for seekhao's tRPC API.
// Vercel rewrites /api/trpc (fallback) and /api/trpc/* to this function, so a
// single handler serves every procedure. Static assets are served by Vercel
// directly from the build output, not through this function.
import "dotenv/config";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`tRPC error on ${path}:`, error.message);
    },
  });

export { handler };
export default handler;
