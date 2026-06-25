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
    binary = false,
    insetFactor = 0.06,
  ) {
    const horizontalInset = (ratios[2] - ratios[0]) * insetFactor;
    const verticalExpansion = (ratios[3] - ratios[1]) * 0.18;
    const crop = {
      x: Math.round(bitmap.width * (ratios[0] + horizontalInset)),
      y: Math.max(0, Math.round(bitmap.height * (ratios[1] - verticalExpansion))),
      width: Math.round(bitmap.width * (ratios[2] - ratios[0] - horizontalInset * 2)),
      height: Math.round(bitmap.height * (ratios[3] - ratios[1] + verticalExpansion * 2)),
    };
    const scale = 8;
    const padding = 70;
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
    const histogram = new Array<number>(256).fill(0);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const value = Math.round(((pixels.data[index] - minimum) / range) * 255);
      histogram[value] += 1;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    }
    if (binary) {
      const total = pixels.data.length / 4;
      let weightedTotal = 0;
      for (let value = 0; value < 256; value += 1) weightedTotal += value * histogram[value];
      let backgroundWeight = 0;
      let backgroundSum = 0;
      let bestVariance = -1;
      let threshold = 160;
      for (let value = 0; value < 256; value += 1) {
        backgroundWeight += histogram[value];
        if (!backgroundWeight) continue;
        const foregroundWeight = total - backgroundWeight;
        if (!foregroundWeight) break;
        backgroundSum += value * histogram[value];
        const backgroundMean = backgroundSum / backgroundWeight;
        const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
        const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
        if (variance > bestVariance) {
          bestVariance = variance;
          threshold = value;
        }
      }
      for (let index = 0; index < pixels.data.length; index += 4) {
        const value = pixels.data[index] < threshold ? 0 : 255;
        pixels.data[index] = value;
        pixels.data[index + 1] = value;
        pixels.data[index + 2] = value;
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  private async recognizeNumericCandidates(
    worker: Worker,
    bitmap: ImageBitmap,
    rect: readonly [number, number, number, number],
  ) {
    const candidates = new Map<number, number>();
    for (const variant of [
      { binary: false, inset: 0.02 },
      { binary: false, inset: 0.08 },
      { binary: true, inset: 0.04 },
    ]) {
      const result = await worker.recognize(
        this.createCellCanvas(bitmap, rect, variant.binary, variant.inset),
      );
      const cleaned = result.data.text.replace(/,/g, "").replace(/[^\d.]/g, "").trim();
      const value = Number(cleaned);
      if (cleaned && Number.isFinite(value)) {
        candidates.set(value, Math.max(candidates.get(value) ?? 0, result.data.confidence));
      }
    }
    return [...candidates.entries()]
      .map(([value, confidence]) => ({ value, confidence }))
      .sort((first, second) => second.confidence - first.confidence)
      .slice(0, 3);
  }

  private chooseQuantityCandidates(
    candidates: Map<string, Array<{ value: number; confidence: number }>>,
  ) {
    const sizeKeys = ["SIZE_8", "SIZE_10", "SIZE_12", "SIZE_14", "SIZE_16", "SIZE_18", "SIZE_20", "SIZE_22"];
    const sizeKg = candidates.get("SIZE_KG")?.[0]?.value;
    const netWeight = candidates.get("NET_WEIGHT")?.[0]?.value;
    const recognizedTotal = candidates.get("TOTAL_QUANTITY")?.[0]?.value;
    const calculatedTotal = sizeKg && netWeight && netWeight % sizeKg === 0
      ? netWeight / sizeKg
      : undefined;
    const expectedTotal = calculatedTotal ?? recognizedTotal;

    if (!expectedTotal) {
      return new Map(
        [...candidates].map(([key, values]) => [key, values[0]?.value]),
      );
    }

    let states = new Map<number, { values: number[]; confidence: number }>([
      [0, { values: [], confidence: 0 }],
    ]);
    for (const key of sizeKeys) {
      const recognized = candidates.get(key) ?? [];
      const options = recognized.some((candidate) => candidate.value === 0)
        ? recognized
        : [...recognized, { value: 0, confidence: recognized.length ? 10 : 50 }];
      const next = new Map<number, { values: number[]; confidence: number }>();
      for (const [sum, state] of states) {
        for (const option of options) {
          const nextSum = sum + option.value;
          if (nextSum > expectedTotal * 1.15) continue;
          const current = next.get(nextSum);
          const confidence = state.confidence + option.confidence;
          if (!current || confidence > current.confidence) {
            next.set(nextSum, { values: [...state.values, option.value], confidence });
          }
        }
      }
      states = next;
    }

    const best = [...states.entries()].sort((first, second) => {
      const firstDistance = Math.abs(first[0] - expectedTotal);
      const secondDistance = Math.abs(second[0] - expectedTotal);
      return firstDistance - secondDistance || second[1].confidence - first[1].confidence;
    })[0];
    const selected = new Map<string, number | undefined>();
    sizeKeys.forEach((key, index) => selected.set(key, best?.[1].values[index]));
    for (const [key, values] of candidates) {
      if (!selected.has(key)) selected.set(key, values[0]?.value);
    }
    selected.set("TOTAL_QUANTITY", expectedTotal);
    return selected;
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
    const numericCandidates = new Map<string, Array<{ value: number; confidence: number }>>();

    for (const cell of cells) {
      await worker.setParameters({
        tessedit_pageseg_mode: cell.numeric ? PSM.SINGLE_WORD : PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: cell.numeric ? "0123456789,." : "",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      if (cell.numeric) {
        numericCandidates.set(cell.key, await this.recognizeNumericCandidates(worker, bitmap, cell.rect));
      } else {
        const result = await worker.recognize(this.createCellCanvas(bitmap, cell.rect));
        values.push(`${cell.key}: ${result.data.text.replace(/\s+/g, " ").trim()}`);
      }
    }
    const selectedNumbers = this.chooseQuantityCandidates(numericCandidates);
    for (const cell of cells.filter((candidate) => candidate.numeric)) {
      values.push(`${cell.key}: ${selectedNumbers.get(cell.key) ?? ""}`);
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
