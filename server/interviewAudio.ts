import express, { type Express } from "express";
import { TRPCError } from "@trpc/server";
import { submitRecordedAnswer, type AudioMimeType } from "./routers";

const MAX_ANSWER_BYTES = 16 * 1024 * 1024;
const audioMimeTypes = new Set<AudioMimeType>(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"]);

export function registerInterviewAudioRoute(app: Express) {
  app.post("/api/interview/audio", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "16mb" }), async (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    const mimeType = req.headers["content-type"]?.split(";", 1)[0] as AudioMimeType;

    if (!sessionId || !audioMimeTypes.has(mimeType)) {
      res.status(400).json({ message: "the recording format could not be read. record it again and retry." });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !req.body.byteLength) {
      res.status(400).json({ message: "we didn't receive an audio sample. check your microphone permission and try again." });
      return;
    }
    if (req.body.byteLength > MAX_ANSWER_BYTES) {
      res.status(413).json({ message: "keep each answer recording under 16mb" });
      return;
    }

    try {
      res.json(await submitRecordedAnswer(sessionId, req.body, mimeType));
    } catch (error) {
      const message = error instanceof Error ? error.message : "we couldn't process that answer. record it again and retry.";
      const status = error instanceof TRPCError && error.code === "NOT_FOUND" ? 404 : error instanceof TRPCError && error.code === "BAD_REQUEST" ? 400 : 500;
      res.status(status).json({ message });
    }
  });
}
