import { AlertCircle, BookOpen, CheckCircle2, Database, RefreshCcw, RotateCcw, Save, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { DownloadExcelButton } from "./components/DownloadExcelButton";
import { ExtractedDataTable } from "./components/ExtractedDataTable";
import { ExcelUploader } from "./components/ExcelUploader";
import { FileUploader } from "./components/FileUploader";
import { ManualModal } from "./components/ManualModal";
import { OcrPreview } from "./components/OcrPreview";
import { PdfPreview } from "./components/PdfPreview";
import { createEmptyPackingList, SAMPLE_DATA } from "./config/packingListFields";
import { useExcelExport } from "./hooks/useExcelExport";
import { useOcr } from "./hooks/useOcr";
import type { PackingListData } from "./types/packingList";

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function App() {
  const ocr = useOcr();
  const excel = useExcelExport();
  const form = useForm<PackingListData>({ defaultValues: createEmptyPackingList() });
  const [notice, setNotice] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [managedExcel, setManagedExcel] = useState<File | null>(null);
  const [documents, setDocuments] = useState<PackingListData[]>([]);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [activeDocument, setActiveDocument] = useState(-1);

  const currentDocuments = () => {
    const next = documents.map((document) => structuredClone(document));
    if (activeDocument >= 0 && next[activeDocument]) next[activeDocument] = form.getValues();
    return next;
  };

  const processFiles = async (files: File[]) => {
    const existing = currentDocuments();
    const results = await ocr.processFiles(files);
    const next = [...existing, ...results.map((result) => result.data)];
    setDocuments(next);
    setDocumentNames((current) => [...current, ...files.map((file) => file.name)]);
    const nextActive = next.length - 1;
    setActiveDocument(nextActive);
    if (nextActive >= 0) form.reset(next[nextActive]);
    setNotice(`${results.length}개 PDF를 추가했습니다. 누적 ${next.length}건입니다.`);
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
    setDocuments(next);
    setDocumentNames(nextNames);
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
      setNotice("OCR 재실행은 가장 최근에 추가한 PDF에서 사용할 수 있습니다.");
      return;
    }
    const result = await ocr.rerun();
    if (!result || activeDocument < 0) return;
    const next = currentDocuments();
    next[activeDocument] = result.data;
    setDocuments(next);
    form.reset(result.data);
    setNotice("현재 PDF의 OCR 결과를 다시 반영했습니다.");
  };

  const resetAll = () => {
    ocr.reset();
    form.reset(createEmptyPackingList());
    setDocuments([]);
    setDocumentNames([]);
    setActiveDocument(-1);
    setManagedExcel(null);
    setNotice("");
  };

  const saveLocal = () => {
    localStorage.setItem("packing-list-draft", JSON.stringify(currentDocuments()));
    setNotice("브라우저에 임시 저장했습니다.");
  };

  const loadSample = () => {
    const sample = structuredClone(SAMPLE_DATA);
    setDocuments([sample]);
    setDocumentNames(["샘플 패킹리스트"]);
    setActiveDocument(0);
    form.reset(sample);
    setNotice("첨부 PDF의 검증 데이터 예시를 불러왔습니다.");
  };

  const download = form.handleSubmit(async (data) => {
    try {
      const next = documents.map((document) => structuredClone(document));
      if (activeDocument >= 0 && next[activeDocument]) next[activeDocument] = data;
      if (!next.length) next.push(data);
      setDocuments(next);
      await excel.exportExcel(next, managedExcel);
      setNotice(managedExcel
        ? "기존 Excel에 필요한 AWB 열 블록과 품목 행을 추가해 다운로드했습니다."
        : "Excel 다운로드가 완료되었습니다.");
    } catch {
      setNotice("");
    }
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600"><Database size={15} /> Shipping Operations</div>
            <h1 className="mt-1 text-xl font-bold">패킹리스트 출고요청서 자동 생성</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <BookOpen size={17} /> 매뉴얼
            </button>
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">100% Browser · Static</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-5 p-5">
        <FileUploader disabled={ocr.isProcessing} onFiles={processFiles} />
        <ExcelUploader
          file={managedExcel}
          disabled={excel.isExporting}
          onFile={setManagedExcel}
        />

        {(ocr.progress || ocr.isProcessing) && (
          <section className="rounded-xl border bg-white p-4 shadow-card">
            <div className="mb-2 flex justify-between text-sm"><span>{ocr.progress?.status}</span><strong>{ocr.progress?.percent ?? 0}%</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600 transition-all" style={{ width: `${ocr.progress?.percent ?? 0}%` }} /></div>
          </section>
        )}

        {(ocr.error || excel.error) && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} /> {ocr.error || excel.error}</div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} /> {notice}</div>
        )}

        {documents.length > 0 && (
          <section className="rounded-xl border bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">스캔한 패킹리스트</h2>
                <p className="text-xs text-slate-500">PDF를 계속 추가한 뒤 각 문서를 선택해 결과를 검수할 수 있습니다.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{documents.length}건</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {documents.map((document, index) => (
                <div
                  key={`${document.awbNo}-${index}`}
                  className={`inline-flex overflow-hidden rounded-lg border ${activeDocument === index ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"}`}
                >
                  <button type="button" onClick={() => selectDocument(index)} className="px-3 py-2 text-left text-xs">
                    <strong className="block text-slate-800">{document.awbNo || `문서 ${index + 1}`}</strong>
                    <span className="text-slate-500">{documentNames[index] || `${document.items.length}개 품목`}</span>
                  </button>
                  <button type="button" aria-label="문서 삭제" onClick={() => removeDocument(index)} className="border-l px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-xl border bg-white p-4 shadow-card">
            <h2 className="mb-3 font-semibold">PDF 미리보기</h2>
            <PdfPreview pageUrls={ocr.pageUrls} />
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-card">
            <h2 className="mb-3 font-semibold">OCR 원문</h2>
            <OcrPreview text={ocr.result?.rawText ?? ""} />
          </div>
        </section>

        <form className="space-y-5" onSubmit={download}>
          <section className="rounded-xl border bg-white p-4 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="font-semibold">기본 정보</h2><p className="text-xs text-slate-500">OCR 결과를 확인하고 수정하세요.</p></div>
              <button type="button" onClick={loadSample} className="text-xs font-semibold text-blue-600 hover:text-blue-800">첨부 샘플값 불러오기</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="text-xs font-semibold text-slate-600">Date<input className={`${fieldClass} mt-1`} {...form.register("date", { required: true })} /></label>
              <label className="text-xs font-semibold text-slate-600">Invoice Ref.No.<input className={`${fieldClass} mt-1`} {...form.register("invoiceNo")} /></label>
              <label className="text-xs font-semibold text-slate-600">Flight<input className={`${fieldClass} mt-1`} {...form.register("flight")} /></label>
              <label className="text-xs font-semibold text-slate-600">Destination<input className={`${fieldClass} mt-1`} {...form.register("destination")} /></label>
              <label className="text-xs font-semibold text-slate-600">Ship By<input className={`${fieldClass} mt-1`} {...form.register("shipBy")} /></label>
              <label className="text-xs font-semibold text-slate-600">AWB NO.<input className={`${fieldClass} mt-1`} {...form.register("awbNo", { required: true })} /></label>
            </div>
          </section>

          <ExtractedDataTable form={form} />

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-card">
            <p className="max-w-3xl text-xs leading-5 text-slate-500">
              {managedExcel
                ? "첨부한 기존 Excel에서 AWB 열 블록과 빈 행을 자동 탐색합니다. AWB가 없으면 새 5열 블록을 만들고, 품목 수만큼 행을 추가하며 다른 시트는 그대로 유지합니다."
                : "기존 Excel을 첨부하지 않으면 내장된 출고요청서 템플릿을 사용합니다. Flight, Invoice, 중량 값은 템플릿 전용 셀이 없어 화면 검수 데이터로 유지됩니다."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocr.isProcessing || activeDocument < 0 || activeDocument !== documents.length - 1} onClick={() => void rerunOcr()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><RefreshCcw size={17} /> 최근 PDF OCR 재실행</button>
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><RotateCcw size={17} /> 초기화</button>
              <button type="button" onClick={saveLocal} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><Save size={17} /> 저장</button>
              <DownloadExcelButton managedExcel={Boolean(managedExcel)} loading={excel.isExporting} onClick={() => void download()} />
            </div>
          </section>
        </form>
      </main>
      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
