import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { canvasToBlob } from "../utils/pdfUtils";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPdf {
  pageImages: Blob[];
  pageUrls: string[];
}

function isMostlyBlank(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const sampleWidth = Math.min(canvas.width, 320);
  const sampleHeight = Math.min(canvas.height, 320);
  const image = context.getImageData(0, 0, sampleWidth, sampleHeight);
  let darkPixels = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const grey = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    if (grey < 245) darkPixels += 1;
  }
  return darkPixels / (image.data.length / 4) < 0.0005;
}

export async function renderPdf(file: File, scale = 2): Promise<RenderedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({
    data: bytes,
    canvasMaxAreaInBytes: -1,
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    useWasm: false,
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
    if (isMostlyBlank(canvas)) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport, intent: "print" }).promise;
    }
    const blob = await canvasToBlob(canvas);
    pageImages.push(blob);
    pageUrls.push(URL.createObjectURL(blob));
  }
  return { pageImages, pageUrls };
}

export function releasePageUrls(urls: string[]) {
  urls.forEach(URL.revokeObjectURL);
}
