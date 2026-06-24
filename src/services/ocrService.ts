import { createWorker, type Worker } from "tesseract.js";
import type { OcrProgress, OcrResult } from "../types/packingList";
import { extractPackingList } from "./extractionService";

export interface IOcrProvider {
  extractText(images: Blob[], onProgress?: (progress: OcrProgress) => void): Promise<string>;
  extractFields(text: string): Promise<OcrResult>;
  terminate(): Promise<void>;
}

export class TesseractOcrProvider implements IOcrProvider {
  private worker: Worker | null = null;
  private activePage = 1;
  private totalPages = 1;
  private onProgress?: (progress: OcrProgress) => void;

  private async getWorker() {
    if (this.worker) return this.worker;
    this.worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text") {
          const pageShare = 1 / this.totalPages;
          const percent = Math.round(((this.activePage - 1) * pageShare + message.progress * pageShare) * 100);
          this.onProgress?.({
            page: this.activePage,
            totalPages: this.totalPages,
            percent,
            status: `페이지 ${this.activePage}/${this.totalPages} OCR 분석 중`,
          });
        }
      },
    });
    return this.worker;
  }

  async extractText(images: Blob[], onProgress?: (progress: OcrProgress) => void) {
    if (!images.length) throw new Error("OCR 처리할 PDF 페이지가 없습니다.");
    this.totalPages = images.length;
    this.onProgress = onProgress;
    const worker = await this.getWorker();
    const texts: string[] = [];

    // PACKING LIST가 마지막 페이지인 샘플을 고려해 역순 처리한다.
    const ordered = images.map((image, index) => ({ image, page: index + 1 })).reverse();
    for (const entry of ordered) {
      this.activePage = entry.page;
      const result = await worker.recognize(entry.image);
      texts.unshift(`--- PAGE ${entry.page} ---\n${result.data.text}`);
    }
    onProgress?.({ page: images.length, totalPages: images.length, percent: 100, status: "OCR 완료" });
    return texts.join("\n\n");
  }

  async extractFields(text: string): Promise<OcrResult> {
    if (!text.trim()) throw new Error("OCR 결과가 비어 있습니다.");
    return { rawText: text, data: extractPackingList(text), confidence: 0 };
  }

  async terminate() {
    await this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * 향후 CLOVA / Google Vision / Upstage / OpenAI 정규화 모듈은
 * IOcrProvider를 구현해 이 팩토리에서 선택하도록 확장한다.
 */
export const createOcrProvider = (): IOcrProvider => new TesseractOcrProvider();
