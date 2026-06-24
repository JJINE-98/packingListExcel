import { FileSpreadsheet, X } from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  file: File | null;
  disabled?: boolean;
  onFile: (file: File | null) => void;
}

export function ExcelUploader({ file, disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const accept = (selected?: File) => {
    if (!selected) return;
    const isXlsx = selected.name.toLowerCase().endsWith(".xlsx");
    if (!isXlsx) {
      setError(".xlsx 형식의 Excel 파일만 사용할 수 있습니다.");
      return;
    }
    setError("");
    onFile(selected);
  };

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-card">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
          <FileSpreadsheet size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">기존 관리 Excel</h2>
          <p className="mt-0.5 truncate text-xs text-slate-600">
            {file
              ? file.name
              : "선택 사항 · 업로드하면 기존 파일의 '출고요청서' 시트에 새 행을 추가합니다."}
          </p>
        </div>
        {file && (
          <button
            type="button"
            onClick={() => {
              onFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <X size={16} /> 해제
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {file ? "Excel 변경" : "Excel 첨부"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </section>
  );
}
