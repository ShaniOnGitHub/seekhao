const MAX_RESUME_TEXT_CHARS = 14_000;
const MAX_PDF_PAGES = 4;

export function normaliseResumeText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_RESUME_TEXT_CHARS);
}

export async function extractResumeText(file: File) {
  if (file.type === "text/plain") {
    const text = normaliseResumeText(await file.text());
    if (text) return text;
    throw new Error("we couldn't find readable text in that resume. choose another file or use a txt resume.");
  }

  if (file.type !== "application/pdf") throw new Error("use a pdf or txt resume for now.");

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
