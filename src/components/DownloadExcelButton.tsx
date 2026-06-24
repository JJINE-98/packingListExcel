import { Download } from "lucide-react";

interface Props {
  disabled?: boolean;
  loading?: boolean;
  managedExcel?: boolean;
  onClick: () => void;
}

export function DownloadExcelButton({ disabled, loading, managedExcel, onClick }: Props) {
  return (
    <button type="button" disabled={disabled || loading} onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
      <Download size={18} /> {loading ? "Excel 생성 중..." : managedExcel ? "행 추가 후 다운로드" : "엑셀 다운로드"}
    </button>
  );
}
