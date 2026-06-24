interface Props { text: string; }

export function OcrPreview({ text }: Props) {
  return (
    <textarea
      readOnly
      value={text}
      placeholder="OCR 실행 후 인식된 원문이 표시됩니다."
      className="h-[620px] w-full resize-none rounded-xl border bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-200 outline-none"
    />
  );
}
