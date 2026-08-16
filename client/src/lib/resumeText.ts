const MAX_RESUME_TEXT_CHARS = 14_000;
const MAX_PDF_PAGES = 4;

// The File.type reported by the browser is often wrong or empty: Windows
// typically labels PDFs as "application/octet-stream" (or ""), which would
// make a perfectly valid resume get rejected. Detect PDF/txt by extension as
// a fallback so the file picker and drag-drop accept real resumes everywhere.
export function detectResumeType(file: File): "pdf" | "txt" | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type === "text/plain" || /\.(txt|text)$/i.test(file.name)) return "txt";
  return null;
}

export function normaliseResumeText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_RESUME_TEXT_CHARS);
}

export async function extractResumeText(file: File) {
  const kind = detectResumeType(file);
  if (!kind) throw new Error("use a pdf or txt resume for now.");

  if (kind === "txt") {
    const text = normaliseResumeText(await file.text());
    if (text) return text;
    throw new Error("we couldn't find readable text in that resume. choose another file or use a txt resume.");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

  try {
    const pages: string[] = [];
    for (let index = 1; index <= Math.min(document.numPages, MAX_PDF_PAGES); index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => "str" in item ? item.str : "").join(" "));
    }
    const text = normaliseResumeText(pages.join("\n"));
    if (text) return text;
  } finally {
    document.cleanup();
  }

  throw new Error("we couldn't find readable text in that PDF. use a searchable PDF or a txt resume.");
}
