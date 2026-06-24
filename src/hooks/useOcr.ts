import { useCallback, useEffect, useRef, useState } from "react";
import { createOcrProvider, type IOcrProvider } from "../services/ocrService";
import { releasePageUrls, renderPdf } from "../services/pdfService";
import type { OcrProgress, OcrResult } from "../types/packingList";

export function useOcr() {
  const provider = useRef<IOcrProvider>(createOcrProvider());
  const [pageImages, setPageImages] = useState<Blob[]>([]);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const processFile = useCallback(async (file: File) => {
    setError("");
    setIsProcessing(true);
    try {
      releasePageUrls(pageUrls);
      setProgress({ page: 0, totalPages: 0, percent: 2, status: "PDF 페이지 렌더링 중" });
      const rendered = await renderPdf(file);
      setPageImages(rendered.pageImages);
      setPageUrls(rendered.pageUrls);
      const rawText = await provider.current.extractText(rendered.pageImages, setProgress);
      setResult(await provider.current.extractFields(rawText));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR 처리 중 오류가 발생했습니다.");
      throw cause;
    } finally {
      setIsProcessing(false);
    }
  }, [pageUrls]);

  const rerun = useCallback(async () => {
    if (!pageImages.length) throw new Error("먼저 PDF를 업로드해 주세요.");
    setError("");
    setIsProcessing(true);
    try {
      const rawText = await provider.current.extractText(pageImages, setProgress);
      setResult(await provider.current.extractFields(rawText));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR 재실행에 실패했습니다.");
    } finally {
      setIsProcessing(false);
    }
  }, [pageImages]);

  const reset = useCallback(() => {
    releasePageUrls(pageUrls);
    setPageImages([]);
    setPageUrls([]);
    setResult(null);
    setProgress(null);
    setError("");
  }, [pageUrls]);

  useEffect(() => () => {
    void provider.current.terminate();
  }, []);

  return { pageUrls, result, setResult, progress, isProcessing, error, processFile, rerun, reset };
}
