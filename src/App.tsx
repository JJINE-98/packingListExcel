import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Database,
  RefreshCcw,
  RotateCcw,
  Save,
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
import { createEmptyPackingList, SAMPLE_DATA } from "./config/packingListFields";
import { useExcelExport } from "./hooks/useExcelExport";
import { useOcr } from "./hooks/useOcr";
import type { PackingListData } from "./types/packingList";

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function App() {
  const ocr = useOcr();
  const excel = useExcelExport();
  const form = useForm<PackingListData>({ defaultValues: createEmptyPackingList() });
  const [manualOpen, setManualOpen] = useState(false);
  const [managedExcel, setManagedExcel] = useState<File | null>(null);
  const [documents, setDocuments] = useState<PackingListData[]>([]);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [documentPageUrls, setDocumentPageUrls] = useState<string[][]>([]);
  const [activeDocument, setActiveDocument] = useState(-1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const pageUrlsRef = useRef<string[][]>([]);

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

  const currentDocuments = () => {
    const next = documents.map((document) => structuredClone(document));
    if (activeDocument >= 0 && next[activeDocument]) next[activeDocument] = form.getValues();
    return next;
  };

  const processFiles = async (files: File[]) => {
    const existing = currentDocuments();
    const processed = await ocr.processFiles(files);
    const next = [...existing, ...processed.map(({ result }) => result.data)];
    setDocuments(next);
    setDocumentNames((current) => [...current, ...files.map((file) => file.name)]);
    setDocumentPageUrls((current) => [...current, ...processed.map(({ pageUrls }) => pageUrls)]);
    const nextActive = next.length - 1;
    setActiveDocument(nextActive);
    if (nextActive >= 0) form.reset(next[nextActive]);
    showToast(`${processed.length}개 PDF를 추가했습니다. 누적 ${next.length}건입니다.`);
  };

  const selectDocument = (index: number) => {
    const next = currentDocuments();
    setDocuments(next);
    setActiveDocument(index);
    form.reset(next[index]);
  };

  const removeDocument = (index: number) => {
    const next = currentDocuments().filter((_, current) => current !== index);
    const nextNames = documentNames.filter((_, current) => current !== index);
    const removedUrls = documentPageUrls[index] ?? [];
    const nextUrls = documentPageUrls.filter((_, current) => current !== index);
    ocr.releasePageUrls(removedUrls);
    setDocuments(next);
    setDocumentNames(nextNames);
    setDocumentPageUrls(nextUrls);
    if (!next.length) {
      setActiveDocument(-1);
      form.reset(createEmptyPackingList());
      return;
    }
    const nextActive = Math.min(index, next.length - 1);
    setActiveDocument(nextActive);
    form.reset(next[nextActive]);
  };

  const rerunOcr = async () => {
    if (activeDocument !== documents.length - 1) {
      showToast("OCR 재실행은 가장 최근에 추가한 PDF에서 사용할 수 있습니다.", "error");
      return;
    }
    const result = await ocr.rerun();
    if (!result || activeDocument < 0) return;
    const next = currentDocuments();
    next[activeDocument] = result.data;
    setDocuments(next);
    form.reset(result.data);
    showToast("현재 PDF의 OCR 결과를 다시 반영했습니다.");
  };

  const resetAll = () => {
    ocr.releasePageUrls(documentPageUrls.flat());
    ocr.reset();
    form.reset(createEmptyPackingList());
    setDocuments([]);
    setDocumentNames([]);
    setDocumentPageUrls([]);
    setActiveDocument(-1);
    setManagedExcel(null);
    setToast(null);
  };

  const saveLocal = () => {
    localStorage.setItem("packing-list-draft", JSON.stringify(currentDocuments()));
    showToast("브라우저에 임시 저장했습니다.");
  };

  const loadSample = () => {
    ocr.releasePageUrls(documentPageUrls.flat());
    const sample = structuredClone(SAMPLE_DATA);
    setDocuments([sample]);
    setDocumentNames(["샘플 패킹리스트"]);
    setDocumentPageUrls([[]]);
    setActiveDocument(0);
    form.reset(sample);
    showToast("검수용 샘플 데이터를 불러왔습니다.");
  };

  const download = form.handleSubmit(async (data) => {
    try {
      const next = documents.map((document) => structuredClone(document));
      if (activeDocument >= 0 && next[activeDocument]) next[activeDocument] = data;
      if (!next.length) next.push(data);
      setDocuments(next);
      await excel.exportExcel(next, managedExcel);
      showToast(managedExcel
        ? "기존 Excel에 AWB 열 블록과 상품 행을 반영해 다운로드했습니다."
        : "Excel 다운로드가 완료되었습니다.");
    } catch {
      // 상세 오류는 useExcelExport의 토스트에서 표시한다.
    }
  });

  const activePageUrls = activeDocument >= 0 ? documentPageUrls[activeDocument] ?? [] : [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b bg-white">
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
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]">
            <div className="space-y-5">
              <section className="rounded-2xl border bg-white p-4 shadow-card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">스캔한 패킹리스트</h2>
                    <p className="text-xs text-slate-500">문서를 선택하면 아래 정보와 오른쪽 PDF가 함께 변경됩니다.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{documents.length}건</span>
                    <button type="button" onClick={loadSample} className="text-xs font-semibold text-blue-600 hover:text-blue-800">샘플값</button>
                  </div>
                </div>

                {documents.length ? (
                  <div className="flex flex-wrap gap-2">
                    {documents.map((document, index) => (
                      <div key={`${document.awbNo}-${index}`} className={`inline-flex overflow-hidden rounded-lg border ${activeDocument === index ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-300 bg-white"}`}>
                        <button type="button" onClick={() => selectDocument(index)} className="px-3 py-2 text-left text-xs">
                          <strong className="block text-slate-800">{document.awbNo || `문서 ${index + 1}`}</strong>
                          <span className="text-slate-500">{documentNames[index] || `${document.items.length}개 상품`}</span>
                        </button>
                        <button type="button" aria-label="문서 삭제" onClick={() => removeDocument(index)} className="border-l px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <X size={15} />
                        </button>
                      </div>
                    ))}
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
                  <div className="flex gap-2">
                    <button type="button" disabled={ocr.isProcessing || activeDocument < 0 || activeDocument !== documents.length - 1} onClick={() => void rerunOcr()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
                      <RefreshCcw size={15} /> OCR 재실행
                    </button>
                    <button type="button" onClick={saveLocal} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50">
                      <Save size={15} /> 임시 저장
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

            <section className="flex h-full min-h-0 flex-col rounded-2xl border bg-white p-4 shadow-card">
              <div className="mb-3">
                <h2 className="font-semibold">PDF 미리보기</h2>
                <p className="text-xs text-slate-500">{activeDocument >= 0 ? documentNames[activeDocument] : "선택된 문서가 없습니다."}</p>
              </div>
              <div className="min-h-0 flex-1">
                <PdfPreview pageUrls={activePageUrls} />
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
