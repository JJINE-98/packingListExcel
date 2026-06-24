import { createWorker, PSM, type Worker } from "tesseract.js";
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

  private createCellCanvas(
    bitmap: ImageBitmap,
    ratios: readonly [number, number, number, number],
  ) {
    const crop = {
      x: Math.round(bitmap.width * ratios[0]),
      y: Math.round(bitmap.height * ratios[1]),
      width: Math.round(bitmap.width * (ratios[2] - ratios[0])),
      height: Math.round(bitmap.height * (ratios[3] - ratios[1])),
    };
    const scale = 5;
    const padding = 50;
    const canvas = document.createElement("canvas");
    canvas.width = crop.width * scale + padding * 2;
    canvas.height = crop.height * scale + padding * 2;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("패킹리스트 셀 OCR 이미지를 만들 수 없습니다.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      padding,
      padding,
      crop.width * scale,
      crop.height * scale,
    );

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let minimum = 255;
    let maximum = 0;
    for (let index = 0; index < pixels.data.length; index += 4) {
      const grey = Math.round(
        pixels.data[index] * 0.299 +
        pixels.data[index + 1] * 0.587 +
        pixels.data[index + 2] * 0.114,
      );
      minimum = Math.min(minimum, grey);
      maximum = Math.max(maximum, grey);
      pixels.data[index] = grey;
    }
    const range = Math.max(1, maximum - minimum);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const value = Math.round(((pixels.data[index] - minimum) / range) * 255);
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  private async recognizePackingTable(image: Blob) {
    const worker = await this.getWorker();
    const bitmap = await createImageBitmap(image);
    const cells = [
      { key: "CUSTOMER", rect: [0.052, 0.431, 0.142, 0.466], numeric: false },
      { key: "PRODUCT", rect: [0.150, 0.410, 0.296, 0.466], numeric: false },
      { key: "SIZE_KG", rect: [0.304, 0.437, 0.343, 0.459], numeric: true },
      { key: "SIZE_8", rect: [0.350, 0.437, 0.382, 0.459], numeric: true },
      { key: "SIZE_10", rect: [0.389, 0.437, 0.420, 0.459], numeric: true },
      { key: "SIZE_12", rect: [0.427, 0.437, 0.458, 0.459], numeric: true },
      { key: "SIZE_14", rect: [0.468, 0.437, 0.493, 0.459], numeric: true },
      { key: "SIZE_16", rect: [0.506, 0.437, 0.531, 0.459], numeric: true },
      { key: "SIZE_18", rect: [0.541, 0.437, 0.572, 0.459], numeric: true },
      { key: "SIZE_20", rect: [0.579, 0.437, 0.610, 0.459], numeric: true },
      { key: "SIZE_22", rect: [0.620, 0.437, 0.645, 0.459], numeric: true },
      { key: "TOTAL_QUANTITY", rect: [0.658, 0.437, 0.707, 0.459], numeric: true },
      { key: "NET_WEIGHT", rect: [0.724, 0.437, 0.777, 0.459], numeric: true },
      { key: "GROSS_WEIGHT", rect: [0.795, 0.437, 0.848, 0.459], numeric: true },
      { key: "REMARKS", rect: [0.860, 0.431, 0.915, 0.466], numeric: false },
    ] as const;
    const values: string[] = [];

    for (const cell of cells) {
      await worker.setParameters({
        tessedit_pageseg_mode: cell.numeric ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: cell.numeric ? "0123456789,." : "",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(this.createCellCanvas(bitmap, cell.rect));
      values.push(`${cell.key}: ${result.data.text.replace(/\s+/g, " ").trim()}`);
    }
    bitmap.close();
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
      preserve_interword_spaces: "1",
    });

    return [
      "--- PACKING TABLE STRUCTURED ---",
      ...values,
    ].join("\n");
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
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(entry.image);
      let pageText = `--- PAGE ${entry.page} ---\n${result.data.text}`;
      if (/PACKING\s*LIST/i.test(result.data.text) || entry.page === images.length) {
        pageText += `\n\n${await this.recognizePackingTable(entry.image)}`;
      }
      texts.unshift(pageText);
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
