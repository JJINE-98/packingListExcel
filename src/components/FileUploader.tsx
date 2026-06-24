import { FileUp, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { isPdfFile } from "../utils/pdfUtils";

interface Props {
  disabled?: boolean;
  onFile: (file: File) => Promise<void>;
}

export function FileUploader({ disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const accept = async (file?: File) => {
    if (!file) return;
    try {
      setError("");
      if (!isPdfFile(file)) throw new Error("PDF 파일만 업로드할 수 있습니다.");
      setName(file.name);
      await onFile(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일 업로드에 실패했습니다.");
    }
  };

  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void accept(event.dataTransfer.files[0]);
      }}
      className={`rounded-xl border-2 border-dashed p-4 transition ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => void accept(event.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <UploadCloud size={18} /> PDF 업로드
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700">{name || "패킹리스트 PDF를 선택하거나 끌어다 놓으세요."}</p>
          <p className="mt-0.5 text-xs text-slate-500">스캔 PDF · 브라우저 내 OCR · 서버 전송 없음</p>
        </div>
        <FileUp className="text-slate-300" size={28} />
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
