import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  RefreshCcw,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { DownloadExcelButton } from "./components/DownloadExcelButton";
import { ExtractedDataTable } from "./components/ExtractedDataTable";
import { ExcelUploader } from "./components/ExcelUploader";
import { FileUploader } from "./components/FileUploader";
import { ManualModal } from "./components/ManualModal";
import { PdfPreview } from "./components/PdfPreview";
import { createEmptyPackingList } from "./config/packingListFields";
import { useExcelExport } from "./hooks/useExcelExport";
import { useOcr } from "./hooks/useOcr";
import type { PackingListData } from "./types/packingList";

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const defaultPdfPageIndex = (pageCount: number) => Math.max(0, Math.min(4, pageCount - 1));
const excelSizeKeys = ["10", "12", "14", "16", "18"] as const;

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error";
}

function quantityMismatch(document: PackingListData) {
  const sizeTotal = document.items.reduce((documentSum, item) =>
    documentSum + excelSizeKeys.reduce((itemSum, size) => itemSum + Number(item.quantities[size] || 0), 0),
  0);
  const totalQty = document.items.reduce((sum, item) => sum + Number(item.totalQuantity || 0), 0);
  return sizeTotal !== totalQty
    ? { sizeTotal, totalQty }
    : undefined;
}

function normalizedAwbKey(awbNo: string) {
  return awbNo.replace(/\D/g, "");
}

function requiredMissing(document: PackingListData) {
  const item = document.items[0];
  return !document.date || !document.awbNo || !item || item.totalQuantity === "";
}

function documentStatus(document: PackingListData, duplicateAwbs: Set<string>) {
  const awbKey = normalizedAwbKey(document.awbNo);
  if (requiredMissing(document)) {
    return {
      label: "미입력",
      tone: "neutral",
      message: "필수값 확인",
    } as const;
  }
  if (awbKey && duplicateAwbs.has(awbKey)) {
    return {
      label: "중복 AWB",
      tone: "danger",
      message: "AWB 중복",
    } as const;
  }
  const mismatch = quantityMismatch(document);
  if (mismatch || document.reviewWarnings?.length) {
    return {
      label: "수량 확인",
      tone: "warning",
      message: mismatch ? `${mismatch.sizeTotal} / ${mismatch.totalQty}` : "OCR 후보 확인",
    } as const;
  }
  return {
    label: "정상",
    tone: "success",
    message: "검증 완료",
  } as const;
}

function statusClass(tone: ReturnType<typeof documentStatus>["tone"]) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function App() {
  const ocr = useOcr();
  const excel = useExcelExport();
  const form = useForm<PackingListData>({ defaultValues: createEmptyPackingList() });
  const [manualOpen, setManualOpen] = useState(false);
  const [managedExcel, setManagedExcel] = useState<File | null>(null);
  const [documents, setDocuments] = useState<PackingListData[]>([]);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [documentPageImages, setDocumentPageImages] = useState<Blob[][]>([]);
  const [documentPageUrls, setDocumentPageUrls] = useState<string[][]>([]);
  const [activeDocument, setActiveDocument] = useState(-1);
  const [activePdfPage, setActivePdfPage] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [leftPanelHeight, setLeftPanelHeight] = useState<number>();
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const pageUrlsRef = useRef<string[][]>([]);
  const watchedForm = form.watch();

  useEffect(() => {
    pageUrlsRef.current = documentPageUrls;
  }, [documentPageUrls]);

  useEffect(() => () => {
    ocr.releasePageUrls(pageUrlsRef.current.flat());
  }, [ocr.releasePageUrls]);

  const showToast = useCallback((message: string, type: ToastState["type"] = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (ocr.error) showToast(ocr.error, "error");
  }, [ocr.error, showToast]);

  useEffect(() => {
    if (excel.error) showToast(excel.error, "error");
  }, [excel.error, showToast]);

  useEffect(() => {
    const element = leftPanelRef.current;
    if (!element) return;
    const updateHeight = () => setLeftPanelHeight(element.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const currentDocuments = () => {
    const next = documents.map((document) => structuredClone(document));
    if (activeDocument >= 0 && next[activeDocument]) next[activeDocument] = form.getValues();
    return next;
  };

  const visibleDocuments = documents.map((document, index) =>
    index === activeDocument ? watchedForm : document,
  );
  const awbCounts = visibleDocuments.reduce<Record<string, number>>((counts, document) => {
    const key = normalizedAwbKey(document.awbNo);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const duplicateAwbs = new Set(
    Object.entries(awbCounts).filter(([, count]) => count > 1).map(([key]) => key),
  );
  const documentStatuses = visibleDocuments.map((document) => documentStatus(document, duplicateAwbs));
  const statusSummary = {
    total: visibleDocuments.length,
    complete: documentStatuses.filter((status) => status.tone === "success").length,
    needsCheck: documentStatuses.filter((status) => status.tone === "warning" || status.tone === "danger").length,
    missing: documentStatuses.filter((status) => status.tone === "neutral").length,
    duplicate: duplicateAwbs.size,
  };

  const processFiles = async (files: File[]) => {
    const existing = currentDocuments();
    const processed = await ocr.processFiles(files);
    const next = [...existing, ...processed.map(({ result }) => result?.data ?? createEmptyPackingList())];
    setDocuments(next);
    setDocumentNames((current) => [...current, ...files.map((file) => file.name)]);
    setDocumentPageImages((current) => [...current, ...processed.map(({ pageImages }) => pageImages)]);
    setDocumentPageUrls((current) => [...current, ...processed.map(({ pageUrls }) => pageUrls)]);
    const nextActive = next.length - 1;
    const activeProcessed = processed[processed.length - 1];
    setActiveDocument(nextActive);
    setActivePdfPage(activeProcessed?.defaultOcrPageIndex ?? defaultPdfPageIndex(activeProcessed?.pageUrls.length ?? 0));
    if (nextActive >= 0) form.reset(next[nextActive]);
    showToast(
      processed.some(({ result }) => result)
        ? `${processed.length}개 PDF를 추가하고 기본 PAGE 5 OCR을 완료했습니다. 다른 페이지가 패킹리스트라면 현재 페이지 OCR 분석을 눌러주세요.`
        : processed.some(({ defaultOcrError }) => defaultOcrError)
          ? `${processed.length}개 PDF를 추가했지만 기본 PAGE 5 OCR은 실패했습니다. 필요한 페이지를 선택한 뒤 현재 페이지 OCR 분석을 눌러주세요.`
        : `${processed.length}개 PDF를 추가했습니다. 오른쪽에서 필요한 페이지를 선택한 뒤 OCR 분석을 눌러주세요.`,
    );
  };

  const selectDocument = (index: number) => {
    const next = currentDocuments();
    setDocuments(next);
    setActiveDocument(index);
    setActivePdfPage(defaultPdfPageIndex(documentPageUrls[index]?.length ?? 0));
    form.reset(next[index]);
  };

  const removeDocument = (index: number) => {
    const next = currentDocuments().filter((_, current) => current !== index);
    const nextNames = documentNames.filter((_, current) => current !== index);
    const nextImages = documentPageImages.filter((_, current) => current !== index);
    const removedUrls = documentPageUrls[index] ?? [];
    const nextUrls = documentPageUrls.filter((_, current) => current !== index);
    ocr.releasePageUrls(removedUrls);
    setDocuments(next);
    setDocumentNames(nextNames);
    setDocumentPageImages(nextImages);
    setDocumentPageUrls(nextUrls);
    if (!next.length) {
      setActiveDocument(-1);
      setActivePdfPage(0);
      form.reset(createEmptyPackingList());
      return;
    }
    const nextActive = Math.min(index, next.length - 1);
    setActiveDocument(nextActive);
    setActivePdfPage(defaultPdfPageIndex(nextUrls[nextActive]?.length ?? 0));
    form.reset(next[nextActive]);
  };

  const analyzeSelectedPage = async () => {
    if (activeDocument < 0) {
      showToast("먼저 PDF 문서를 선택해 주세요.", "error");
      return;
    }
    const pageImage = documentPageImages[activeDocument]?.[activePdfPage];
    if (!pageImage) {
      showToast("선택한 페이지 이미지를 찾을 수 없습니다.", "error");
      return;
    }
    const result = await ocr.analyzePage(pageImage, activePdfPage + 1);
    if (!result) return;
    const next = currentDocuments();
    next[activeDocument] = result.data;
    setDocuments(next);
    form.reset(result.data);
    showToast(`PAGE ${activePdfPage + 1} OCR 결과를 반영했습니다.`);
  };

  const rerunOcr = async () => {
    await analyzeSelectedPage();
  };

  const resetAll = () => {
    ocr.releasePageUrls(documentPageUrls.flat());
    ocr.reset();
    form.reset(createEmptyPackingList());
    setDocuments([]);
    setDocumentNames([]);
    setDocumentPageImages([]);
    setDocumentPageUrls([]);
    setActiveDocument(-1);
    setActivePdfPage(0);
    setManagedExcel(null);
    setToast(null);
  };

  const download = form.handleSubmit(async (data) => {
    try {
      const next = documents.map((document) => structuredClone(document));
      if (activeDocument >= 0 && next[activeDocument]) next[activeDocument] = data;
      if (!next.length) next.push(data);
      setDocuments(next);
      const nextAwbCounts = next.reduce<Record<string, number>>((counts, document) => {
        const key = normalizedAwbKey(document.awbNo);
        if (key) counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      const missingIndex = next.findIndex((document) => requiredMissing(document));
      if (missingIndex >= 0) {
        setActiveDocument(missingIndex);
        setActivePdfPage(defaultPdfPageIndex(documentPageUrls[missingIndex]?.length ?? 0));
        form.reset(next[missingIndex]);
        window.setTimeout(() => {
          leftPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          form.setFocus(!next[missingIndex].date ? "date" : !next[missingIndex].awbNo ? "awbNo" : "items.0.totalQuantity");
        }, 50);
        const label = next[missingIndex].awbNo || documentNames[missingIndex] || `문서 ${missingIndex + 1}`;
        showToast(`${label}에 필수값이 비어 있습니다. Date, AWB NO., Total Qty를 확인해 주세요.`, "error");
        return;
      }
      const duplicateIndex = next.findIndex((document) => {
        const key = normalizedAwbKey(document.awbNo);
        return key && nextAwbCounts[key] > 1;
      });
      if (duplicateIndex >= 0) {
        setActiveDocument(duplicateIndex);
        setActivePdfPage(defaultPdfPageIndex(documentPageUrls[duplicateIndex]?.length ?? 0));
        form.reset(next[duplicateIndex]);
        window.setTimeout(() => {
          leftPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          form.setFocus("awbNo");
        }, 50);
        showToast(`${next[duplicateIndex].awbNo} AWB가 중복 등록되었습니다. 문서를 확인해 주세요.`, "error");
        return;
      }
      const mismatchIndex = next.findIndex((document) => quantityMismatch(document));
      if (mismatchIndex >= 0) {
        const mismatch = quantityMismatch(next[mismatchIndex])!;
        setActiveDocument(mismatchIndex);
        setActivePdfPage(defaultPdfPageIndex(documentPageUrls[mismatchIndex]?.length ?? 0));
        form.reset(next[mismatchIndex]);
        window.setTimeout(() => {
          leftPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          form.setFocus("items.0.totalQuantity");
        }, 50);
        const label = next[mismatchIndex].awbNo || documentNames[mismatchIndex] || `문서 ${mismatchIndex + 1}`;
        showToast(
          `${label}의 사이즈별 수량 합계(${mismatch.sizeTotal})와 Total Qty(${mismatch.totalQty})가 다릅니다. 값을 확인해 주세요.`,
          "error",
        );
        return;
      }
      const reviewIndex = next.findIndex((document) => document.reviewWarnings?.length);
      if (reviewIndex >= 0) {
        setActiveDocument(reviewIndex);
        setActivePdfPage(defaultPdfPageIndex(documentPageUrls[reviewIndex]?.length ?? 0));
        form.reset(next[reviewIndex]);
        window.setTimeout(() => {
          leftPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          form.setFocus("items.0.totalQuantity");
        }, 50);
        const label = next[reviewIndex].awbNo || documentNames[reviewIndex] || `문서 ${reviewIndex + 1}`;
        showToast(`${label}의 수량 OCR 후보가 서로 달라 확인이 필요합니다. 원본 PDF와 수량을 비교해 주세요.`, "error");
        return;
      }
      await excel.exportExcel(next, managedExcel);
      showToast(managedExcel
        ? "기존 Excel에 AWB 열 블록과 상품 행을 반영해 다운로드했습니다."
        : "Excel 다운로드가 완료되었습니다.");
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : "Excel 다운로드 중 오류가 발생했습니다.",
        "error",
      );
    }
  }, (errors) => {
    if (errors.date) {
      showToast("날짜가 인식되지 않았습니다. Date를 입력한 후 다시 다운로드해 주세요.", "error");
      return;
    }
    if (errors.awbNo) {
      showToast("AWB NO.를 입력한 후 다시 다운로드해 주세요.", "error");
    }
  });

  const activePageUrls = activeDocument >= 0 ? documentPageUrls[activeDocument] ?? [] : [];

  return (
    <div className="min-h-screen bg-[#eef2f7] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600"><Database size={15} /> Shipping Operations</div>
            <h1 className="mt-1 text-xl font-bold">패킹리스트 출고요청서 자동 생성</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setManualOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
              <BookOpen size={17} /> 매뉴얼
            </button>
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">100% Browser · Static</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-5 p-5">
        <FileUploader disabled={ocr.isProcessing} onFiles={processFiles} onError={(message) => showToast(message, "error")} />

        {(ocr.progress || ocr.isProcessing) && (
          <section className="rounded-xl border bg-white p-4 shadow-card">
            <div className="mb-2 flex justify-between text-sm"><span>{ocr.progress?.status}</span><strong>{ocr.progress?.percent ?? 0}%</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600 transition-all" style={{ width: `${ocr.progress?.percent ?? 0}%` }} /></div>
          </section>
        )}

        <form className="space-y-5" onSubmit={download}>
          <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]">
            <div ref={leftPanelRef} className="self-start space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">스캔한 패킹리스트</h2>
                    <p className="text-xs text-slate-500">문서를 선택하면 아래 정보와 오른쪽 PDF가 함께 변경됩니다.</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {[
                      { label: "총", value: statusSummary.total, icon: FileText, tone: "border-slate-200 bg-slate-50 text-slate-700" },
                      { label: "정상", value: statusSummary.complete, icon: CheckCircle2, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
                      { label: "확인", value: statusSummary.needsCheck, icon: AlertTriangle, tone: "border-amber-200 bg-amber-50 text-amber-700" },
                      { label: "미입력", value: statusSummary.missing, icon: AlertCircle, tone: "border-slate-200 bg-slate-100 text-slate-600" },
                      { label: "중복", value: statusSummary.duplicate, icon: FileCheck2, tone: statusSummary.duplicate ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600" },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <span key={item.label} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${item.tone}`}>
                          <Icon size={13} className="opacity-75" />
                          {item.label}
                          <span className="font-mono text-xs font-black tabular-nums">{item.value}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {documents.length ? (
                  <div className="flex flex-wrap gap-2">
                    {documents.map((document, index) => {
                      const status = documentStatuses[index];
                      return (
                      <div key={`${document.awbNo}-${index}`} className={`inline-flex overflow-hidden rounded-xl border shadow-sm ${activeDocument === index ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-300 bg-white"}`}>
                        <button type="button" onClick={() => selectDocument(index)} className="min-w-[210px] px-3 py-2 text-left text-xs">
                          <span className="flex items-center gap-2">
                            <strong className="min-w-0 flex-1 truncate text-slate-800">{document.awbNo || `문서 ${index + 1}`}</strong>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(status.tone)}`}>
                              {status.label}
                            </span>
                          </span>
                          <span className="mt-1 block max-w-[190px] truncate text-slate-500">{documentNames[index] || `${document.items.length}개 상품`}</span>
                        </button>
                        <button type="button" aria-label="문서 삭제" onClick={() => removeDocument(index)} className="border-l px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <X size={15} />
                        </button>
                      </div>
                    );})}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">상단에서 패킹리스트 PDF를 추가하세요.</div>
                )}
              </section>

              <section className="rounded-2xl border bg-white p-4 shadow-card">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">패킹리스트 정보</h2>
                    <p className="text-xs text-slate-500">Excel에 반영되는 날짜와 AWB를 확인하세요.</p>
                  </div>
                  <div>
                    <button type="button" disabled={ocr.isProcessing || activeDocument < 0} onClick={() => void rerunOcr()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
                      <RefreshCcw size={15} /> OCR 재실행
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Date
                    <input type="date" className={fieldClass} {...form.register("date", { required: true })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    AWB NO.
                    <input className={fieldClass} {...form.register("awbNo", { required: true })} />
                  </label>
                </div>
              </section>

              <ExtractedDataTable form={form} />
            </div>

            <section
              className="flex min-h-0 self-start flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-card"
              style={leftPanelHeight ? { height: leftPanelHeight } : undefined}
            >
              <div className="mb-3">
                <h2 className="font-semibold">PDF 미리보기</h2>
                <p className="text-xs text-slate-500">{activeDocument >= 0 ? documentNames[activeDocument] : "선택된 문서가 없습니다."}</p>
              </div>
              <div className="min-h-0 flex-1">
                <PdfPreview
                  pageUrls={activePageUrls}
                  activePage={activePdfPage}
                  disabled={ocr.isProcessing || activeDocument < 0}
                  onActivePage={setActivePdfPage}
                  onAnalyzePage={() => void analyzeSelectedPage()}
                />
              </div>
            </section>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Excel Output</p>
                <h2 className="mt-1 text-lg font-bold">출고요청서 Excel 생성</h2>
                <p className="mt-1 text-sm text-slate-500">기존 관리 Excel을 첨부하거나 내장 템플릿으로 새 파일을 생성하세요.</p>
              </div>
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <RotateCcw size={16} /> 전체 초기화
              </button>
            </div>
            <ExcelUploader file={managedExcel} disabled={excel.isExporting} onFile={setManagedExcel} onError={(message) => showToast(message, "error")} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
              <p className="max-w-4xl text-xs leading-5 text-slate-500">
                {managedExcel
                  ? "첨부한 Excel의 '출고요청서' 시트에서 AWB 열과 빈 행을 찾아 모든 패킹리스트 상품을 순서대로 추가합니다."
                  : "Excel을 첨부하지 않으면 내장된 출고요청서 템플릿을 사용해 다운로드합니다."}
              </p>
              <DownloadExcelButton managedExcel={Boolean(managedExcel)} loading={excel.isExporting} onClick={() => void download()} />
            </div>
          </section>
        </form>
      </main>

      {toast && (
        <button
          key={toast.id}
          type="button"
          onClick={() => setToast(null)}
          className={`fixed right-5 top-5 z-[60] flex w-[min(440px,calc(100vw-40px))] items-start gap-3 rounded-2xl border p-4 text-left shadow-2xl transition ${
            toast.type === "error"
              ? "border-red-200 bg-red-600 text-white"
              : "border-emerald-200 bg-emerald-600 text-white"
          }`}
        >
          {toast.type === "error" ? <AlertCircle className="mt-0.5 shrink-0" size={21} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={21} />}
          <span className="flex-1 text-sm font-semibold leading-6">{toast.message}</span>
          <X className="mt-0.5 shrink-0 opacity-80" size={18} />
        </button>
      )}

      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
