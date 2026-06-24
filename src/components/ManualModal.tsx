import { FileCheck2, FileDown, ScanText, Upload, X } from "lucide-react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: Upload,
    title: "1. PDF 여러 개 추가",
    description: "PDF를 한 번에 여러 개 선택하거나 작업 중 계속 추가할 수 있습니다. 이전 스캔 결과는 지워지지 않고 누적됩니다.",
  },
  {
    icon: ScanText,
    title: "2. OCR 분석",
    description: "PDF 페이지를 이미지로 변환한 뒤 OCR을 실행합니다. 진행률과 인식 원문을 확인할 수 있습니다.",
  },
  {
    icon: FileCheck2,
    title: "3. 결과 검수",
    description: "스캔 목록에서 문서를 선택해 기본 정보와 품목별 수량을 확인하고, 오인식된 값은 표에서 직접 수정합니다.",
  },
  {
    icon: FileDown,
    title: "4. Excel 열·행 추가",
    description: "모든 PDF를 한 번에 반영합니다. AWB가 없으면 새 5열 블록을 만들고, 각 패킹리스트의 품목 수만큼 출고 행을 추가합니다.",
  },
];

export function ManualModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-4 border-b bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Quick Guide</p>
            <h2 id="manual-title" className="mt-1 text-xl font-bold text-slate-900">사용 매뉴얼</h2>
            <p className="mt-1 text-sm text-slate-500">패킹리스트를 출고요청서로 만드는 기본 작업 순서입니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="매뉴얼 닫기"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map(({ icon: Icon, title, description }) => (
              <li key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Icon size={18} />
                </div>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-900">검수 시 확인할 항목</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900/80">
              <li>Date와 AWB NO.는 Excel 생성에 필요한 필수값입니다.</li>
              <li>Size 10, 12, 14, 16, 18 수량과 Total Qty가 일치하는지 확인하세요.</li>
              <li>한 PDF에 품목이 여러 개면 합산하지 않고 품목마다 별도 출고 행으로 입력합니다.</li>
              <li>PDF를 추가로 스캔해도 기존 결과는 유지되며, 최종 다운로드 때 모두 순서대로 반영됩니다.</li>
              <li>기존 Excel에 AWB가 없으면 마지막 AWB 뒤에 Size 10~18의 새 열 블록을 자동 생성합니다.</li>
              <li>빈 행이 없으면 합계 행 바로 위에 기존 스타일과 수식을 유지한 새 행을 삽입합니다.</li>
              <li>첨부 Excel의 나머지 시트는 데이터를 입력하지 않고 기존 내용을 유지합니다.</li>
              <li>Flight, Invoice, 중량 정보는 템플릿 전용 셀이 없어 검수 화면에만 유지됩니다.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">편집 기능</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              행 추가, 행 복사, 행 삭제, 행 초기화와 OCR 재실행을 사용할 수 있습니다.
              저장 버튼은 현재 입력 내용을 이 브라우저에 임시 저장합니다.
            </p>
          </div>
        </div>

        <footer className="sticky bottom-0 border-t bg-white px-5 py-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            확인
          </button>
        </footer>
      </section>
    </div>
  );
}
