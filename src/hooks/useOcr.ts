import { useCallback, useEffect, useRef, useState } from "react";
import { createOcrProvider, type IOcrProvider } from "../services/ocrService";
import { releasePageUrls, renderPdf } from "../services/pdfService";
import type { OcrProgress, OcrResult } from "../types/packingList";
import { normalizeAwb } from "../utils/excelUtils";

export interface ProcessedPdf {
  pageImages: Blob[];
  pageUrls: string[];
}

export function useOcr() {
  const provider = useRef<IOcrProvider>(createOcrProvider());
  const [latestPageImages, setLatestPageImages] = useState<Blob[]>([]);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const processFiles = useCallback(async (files: File[]) => {
    if (!files.length) return [];
    setError("");
    setIsProcessing(true);
    try {
      const processed: ProcessedPdf[] = [];
      for (let index = 0; index < files.length; index += 1) {
        setProgress({
          page: index + 1,
          totalPages: files.length,
          percent: Math.round((index / files.length) * 100),
          status: `PDF ${index + 1}/${files.length} 미리보기 준비 중`,
        });
        const rendered = await renderPdf(files[index]);
        processed.push({
          pageImages: rendered.pageImages,
          pageUrls: rendered.pageUrls,
        });
      }
      setProgress({
        page: files.length,
        totalPages: files.length,
        percent: 100,
        status: `${files.length}개 PDF 미리보기 준비 완료`,
      });
      return processed;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR 처리 중 오류가 발생했습니다.");
      throw cause;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const analyzePage = useCallback(async (pageImage: Blob, pageNumber: number) => {
    setError("");
    setIsProcessing(true);
    try {
      const selectedPage = [pageImage];
      setLatestPageImages(selectedPage);
      const rawText = await provider.current.extractText(selectedPage, (progress) => {
        setProgress({
          ...progress,
          status: `PAGE ${pageNumber} ${progress.status}`,
        });
      });
      const nextResult = await provider.current.extractFields(rawText);
      nextResult.data.awbNo = normalizeAwb(nextResult.data.awbNo);
      return nextResult;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR 재실행에 실패했습니다.");
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const rerun = useCallback(async () => {
    if (!latestPageImages.length) throw new Error("먼저 분석할 PDF 페이지를 선택해 주세요.");
    return analyzePage(latestPageImages[0], 1);
  }, [analyzePage, latestPageImages]);

  const reset = useCallback(() => {
    setLatestPageImages([]);
    setProgress(null);
    setError("");
  }, []);

  useEffect(() => () => {
    void provider.current.terminate();
  }, []);

  return { progress, isProcessing, error, processFiles, analyzePage, rerun, reset, releasePageUrls };
}
