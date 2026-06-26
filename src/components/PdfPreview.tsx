import { ScanSearch } from "lucide-react";
import { useEffect } from "react";

interface Props {
  pageUrls: string[];
  activePage: number;
  disabled?: boolean;
  onActivePage: (page: number) => void;
  onAnalyzePage: () => void;
}

export function PdfPreview({ pageUrls, activePage, disabled, onActivePage, onAnalyzePage }: Props) {
  useEffect(() => {
    if (activePage >= pageUrls.length) onActivePage(0);
  }, [activePage, onActivePage, pageUrls.length]);

  if (!pageUrls.length) {
    return <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-slate-500">패킹리스트를 선택하면 PDF가 표시됩니다.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300 bg-slate-200">
      <div className="shrink-0 border-b border-slate-300 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">PDF Viewer</p>
            <p className="font-mono text-xs font-bold text-slate-700 tabular-nums">PAGE {activePage + 1} / {pageUrls.length}</p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={onAnalyzePage}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-45"
          >
            <ScanSearch size={16} /> 현재 페이지 OCR 분석
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {pageUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => onActivePage(index)}
              className={`shrink-0 rounded-md px-3 py-1.5 font-mono text-xs font-bold transition ${
                activePage === index
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              PAGE {index + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <img
            src={pageUrls[activePage]}
            alt={`PDF ${activePage + 1}페이지`}
            className="h-auto w-full"
          />
        </div>
      </div>
    </div>
  );
}
