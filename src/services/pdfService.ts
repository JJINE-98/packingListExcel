import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { canvasToBlob } from "../utils/pdfUtils";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPdf {
  pageImages: Blob[];
  pageUrls: string[];
}

export async function renderPdf(file: File, scale = 2): Promise<RenderedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({
    data: bytes,
    isImageDecoderSupported: false,
    useSystemFonts: true,
  }).promise;
  const pageImages: Blob[] = [];
  const pageUrls: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("PDF 렌더링 컨텍스트를 만들 수 없습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await canvasToBlob(canvas);
    pageImages.push(blob);
    pageUrls.push(URL.createObjectURL(blob));
  }
  return { pageImages, pageUrls };
}

export function releasePageUrls(urls: string[]) {
  urls.forEach(URL.revokeObjectURL);
}
