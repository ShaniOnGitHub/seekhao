// Standalone storage backend for self-hosted deployments (e.g. Render).
// When the Manus Forge storage service is unavailable (no BUILT_IN_FORGE_*
// keys), audio is stored on the instance's local filesystem under a temp
// directory. The same instance that writes the file serves it back through
// /storage-local/*, so transcription can fetch it via a local URL.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STORE_DIR = path.join(os.tmpdir(), "seekho-storage");

export function storageEnabled(): boolean {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    return true;
  } catch (error) {
    console.error("[LocalStorage] cannot create store dir:", error);
    return false;
  }
}

function safeFileName(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 40);
}

export async function localStoragePut(
  relKey: string,
  data: Buffer | Uint8Array,
): Promise<{ key: string; localUrl: string }> {
  if (!storageEnabled()) throw new Error("local storage unavailable");
  const name = `${safeFileName(relKey)}_${Date.now()}`;
  const filePath = path.join(STORE_DIR, name);
  await fs.promises.writeFile(filePath, data as Buffer);
  return { key: name, localUrl: `/storage-local/${name}` };
}

export async function localStorageGetBuffer(key: string): Promise<Buffer> {
  if (!storageEnabled()) throw new Error("local storage unavailable");
  const filePath = path.join(STORE_DIR, key);
  if (!filePath.startsWith(STORE_DIR + path.sep)) {
    throw new Error("invalid storage key");
  }
  return fs.promises.readFile(filePath);
}

export async function localStorageCleanup(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  if (!storageEnabled()) return 0;
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  try {
    const entries = await fs.promises.readdir(STORE_DIR);
    for (const entry of entries) {
      const filePath = path.join(STORE_DIR, entry);
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) {
        await fs.promises.unlink(filePath);
        removed += 1;
      }
    }
  } catch (error) {
    console.error("[LocalStorage] cleanup failed:", error);
  }
  return removed;
}
