import { useCallback, useEffect, useRef, useState } from "react";
import { createOcrProvider, type IOcrProvider } from "../services/ocrService";
import { releasePageUrls, renderPdf } from "../services/pdfService";
import type { OcrProgress, OcrResult } from "../types/packingList";

export interface ProcessedPdf {
  result: OcrResult;
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
          status: `PDF ${index + 1}/${files.length} 렌더링 중`,
        });
        const rendered = await renderPdf(files[index]);
        setLatestPageImages(rendered.pageImages);
        const rawText = await provider.current.extractText(rendered.pageImages, (progress) => {
          setProgress({
            ...progress,
            percent: Math.round(((index + progress.percent / 100) / files.length) * 100),
            status: `PDF ${index + 1}/${files.length} · ${progress.status}`,
          });
        });
        processed.push({
          result: await provider.current.extractFields(rawText),
          pageUrls: rendered.pageUrls,
        });
      }
      setProgress({
        page: files.length,
        totalPages: files.length,
        percent: 100,
        status: `${files.length}개 PDF OCR 완료`,
      });
      return processed;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR 처리 중 오류가 발생했습니다.");
      throw cause;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const rerun = useCallback(async () => {
    if (!latestPageImages.length) throw new Error("먼저 PDF를 업로드해 주세요.");
    setError("");
    setIsProcessing(true);
    try {
      const rawText = await provider.current.extractText(latestPageImages, setProgress);
      const nextResult = await provider.current.extractFields(rawText);
      return nextResult;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR 재실행에 실패했습니다.");
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [latestPageImages]);

  const reset = useCallback(() => {
    setLatestPageImages([]);
    setProgress(null);
    setError("");
  }, []);

  useEffect(() => () => {
    void provider.current.terminate();
  }, []);

  return { progress, isProcessing, error, processFiles, rerun, reset, releasePageUrls };
}
