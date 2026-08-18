import type { Express } from "express";
import { ENV } from "./env";
import {
  localStorageGetBuffer,
  localStorageCleanup,
  storageEnabled,
} from "./localStorage";

export function registerStorageProxy(app: Express) {
  // Self-hosted deployments (e.g. Render) store audio on the instance's
  // local filesystem and serve it back through this route.
  app.get("/storage-local/:key", async (req, res) => {
    const key = (req.params as Record<string, string>).key;
    if (!key || !storageEnabled()) {
      res.status(400).send("Missing or unavailable storage key");
      return;
    }
    try {
      const buffer = await localStorageGetBuffer(key);
      res.set("Cache-Control", "no-store");
      res.contentType("audio/*");
      res.send(buffer);
    } catch (error) {
      console.error("[StorageProxy] local read failed:", error);
      res.status(404).send("Stored audio not found");
    }
  });

  // Sweep stale local audio files once a day.
  setInterval(() => { void localStorageCleanup(); }, 24 * 60 * 60 * 1000);

  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
