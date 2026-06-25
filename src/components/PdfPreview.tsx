import { useEffect, useState } from "react";

interface Props { pageUrls: string[]; }

export function PdfPreview({ pageUrls }: Props) {
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    setActivePage(0);
  }, [pageUrls]);

  if (!pageUrls.length) {
    return <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-slate-500">패킹리스트를 선택하면 PDF가 표시됩니다.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-slate-200">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white p-2">
        {pageUrls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setActivePage(index)}
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
