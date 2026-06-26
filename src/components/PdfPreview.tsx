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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-slate-200">
      <div className="shrink-0 border-b bg-white p-2">
        <div className="flex gap-1 overflow-x-auto">
          {pageUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => onActivePage(index)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activePage === index
                  ? "bg-blue-600 text-white"
                  : "border bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              PAGE {index + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onAnalyzePage}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-45"
        >
          <ScanSearch size={16} /> 현재 페이지 OCR 분석
        </button>
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
