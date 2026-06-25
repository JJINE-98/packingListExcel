interface Props { pageUrls: string[]; }

export function PdfPreview({ pageUrls }: Props) {
  if (!pageUrls.length) {
    return <div className="flex min-h-[680px] items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-slate-500">패킹리스트를 선택하면 PDF가 표시됩니다.</div>;
  }
  return (
    <div className="max-h-[920px] space-y-3 overflow-auto rounded-xl border bg-slate-200 p-3">
      {pageUrls.map((url, index) => (
        <div key={url} className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b px-3 py-1.5 text-xs font-semibold text-slate-500">PAGE {index + 1}</div>
          <img src={url} alt={`PDF ${index + 1}페이지`} className="h-auto w-full" />
        </div>
      ))}
    </div>
  );
}
