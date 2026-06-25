import { AlertCircle, FileCheck2, FileDown, ScanText, Upload, X } from "lucide-react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: Upload,
    title: "1. 패킹리스트 PDF 선택",
    description: "화면 위쪽의 PDF 업로드 영역을 눌러 파일을 선택하세요. 여러 파일을 한 번에 선택해도 되고, 작업 중에 추가로 올려도 됩니다.",
  },
  {
    icon: ScanText,
    title: "2. OCR이 끝날 때까지 기다리기",
    description: "업로드하면 글자와 숫자를 자동으로 읽습니다. 진행률이 100%가 될 때까지 기다려 주세요. 처리 중에는 창을 닫지 않는 것이 좋습니다.",
  },
  {
    icon: FileCheck2,
    title: "3. 읽은 내용 확인 및 수정",
    description: "왼쪽에서 Date, AWB NO., 상품명과 수량을 확인하세요. 오른쪽 PDF와 비교해 틀린 값이 있으면 입력란을 눌러 직접 고칠 수 있습니다.",
  },
  {
    icon: FileDown,
    title: "4. Excel 다운로드",
    description: "기존 관리 Excel에 추가하려면 아래에서 파일을 먼저 첨부하세요. 첨부하지 않으면 내장된 빈 샘플 양식으로 새 Excel이 만들어집니다.",
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
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-4 border-b bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Quick Guide</p>
            <h2 id="manual-title" className="mt-1 text-xl font-bold text-slate-900">사용 매뉴얼</h2>
            <p className="mt-1 text-sm text-slate-500">처음 사용하셔도 아래 순서대로 진행하면 됩니다.</p>
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
            <div className="flex items-center gap-2 text-amber-900">
              <AlertCircle size={19} />
              <h3 className="font-semibold">다운로드 전에 꼭 확인하세요</h3>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-amber-900/80">
              <li><strong>Date</strong>와 <strong>AWB NO.</strong>가 비어 있으면 다운로드할 수 없습니다.</li>
              <li>날짜가 인식되지 않았다면 Date 입력란의 달력에서 직접 선택하세요.</li>
              <li>AWB는 예: <strong>618-5634-3420</strong> 형식인지 PDF와 비교하세요.</li>
              <li>Size 10, 12, 14, 16, 18의 수량을 확인하고, 합계가 Total Qty와 맞는지 확인하세요.</li>
              <li>OCR은 흐린 글씨나 작은 숫자를 잘못 읽을 수 있으므로 수량은 반드시 PDF와 한 번 비교해 주세요.</li>
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">PDF가 여러 개인 경우</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                ‘스캔한 패킹리스트’ 목록에서 문서 이름을 누르면 해당 문서의 정보와 PDF가 함께 바뀝니다. 모든 문서를 하나씩 확인한 뒤 다운로드하세요.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">PDF 페이지 확인 방법</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                오른쪽 미리보기 위의 PAGE 버튼으로 페이지를 바꿀 수 있습니다. PDF가 길면 미리보기 영역 안에서 스크롤하세요.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">기존 Excel을 첨부하면</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                기존 출고요청서의 마지막 데이터 다음 행에 내용을 추가합니다. AWB 열이 없으면 Size 10~18 열을 새로 만들어 반영합니다.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">Excel을 첨부하지 않으면</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                내장된 빈 샘플 템플릿에 현재 PDF의 내용만 입력해 다운로드합니다. 원본 PDF나 업로드한 Excel 파일은 변경되지 않습니다.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h3 className="font-semibold text-blue-900">문제가 생겼을 때</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-blue-900/80">
              <li>잘못 읽힌 값은 입력란에서 직접 수정하는 것이 가장 빠릅니다.</li>
              <li>결과가 많이 틀렸다면 해당 문서를 선택한 뒤 <strong>OCR 재실행</strong>을 눌러 보세요.</li>
              <li>오류가 발생하면 화면 알림창의 안내를 확인하고, 빠진 Date 또는 AWB를 먼저 입력하세요.</li>
            </ul>
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
