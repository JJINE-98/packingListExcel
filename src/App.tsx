import { AlertCircle, BookOpen, CheckCircle2, Database, RefreshCcw, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { DownloadExcelButton } from "./components/DownloadExcelButton";
import { ExtractedDataTable } from "./components/ExtractedDataTable";
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

  useEffect(() => {
    if (ocr.result) form.reset(ocr.result.data);
  }, [ocr.result, form]);

  const resetAll = () => {
    ocr.reset();
    form.reset(createEmptyPackingList());
    setNotice("");
  };

  const saveLocal = () => {
    localStorage.setItem("packing-list-draft", JSON.stringify(form.getValues()));
    setNotice("브라우저에 임시 저장했습니다.");
  };

  const loadSample = () => {
    form.reset(SAMPLE_DATA);
    setNotice("첨부 PDF의 검증 데이터 예시를 불러왔습니다.");
  };

  const download = form.handleSubmit(async (data) => {
    try {
      await excel.exportExcel(data);
      setNotice("Excel 다운로드가 완료되었습니다.");
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
        <FileUploader disabled={ocr.isProcessing} onFile={ocr.processFile} />

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
              첨부 Excel의 실제 `출고요청서` 시트 27행과 BH:BL 사이즈 블록에 기록합니다. 템플릿에 전용 셀이 없는 Flight, Invoice, 중량 값은 화면 검수 데이터로 유지됩니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocr.isProcessing} onClick={() => void ocr.rerun()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><RefreshCcw size={17} /> OCR 재실행</button>
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><RotateCcw size={17} /> 초기화</button>
              <button type="button" onClick={saveLocal} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><Save size={17} /> 저장</button>
              <DownloadExcelButton loading={excel.isExporting} onClick={() => void download()} />
            </div>
          </section>
        </form>
      </main>
      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
