import { useEffect } from "react";

interface Props {
  pageUrls: string[];
  activePage: number;
  onActivePage: (page: number) => void;
}

export function PdfPreview({ pageUrls, activePage, onActivePage }: Props) {
  useEffect(() => {
    if (activePage >= pageUrls.length) onActivePage(0);
  }, [activePage, onActivePage, pageUrls.length]);

  if (!pageUrls.length) {
    return <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-slate-500">패킹리스트를 선택하면 PDF가 표시됩니다.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300 bg-slate-200">
      <div className="shrink-0 border-b border-slate-300 bg-slate-50 px-3 py-2">
        <div className="flex gap-1 overflow-x-auto">
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
