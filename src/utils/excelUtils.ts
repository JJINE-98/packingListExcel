export function excelSerialFromDate(value: string): number | string {
  const normalized = value
    .replace(/(\d{1,2})\s+([A-Za-z]{3})\.?,\s*(\d{4})/, "$1 $2 $3")
    .replace(/\./g, "");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  const utc = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

export function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const normalized = trimmed
    .replace(/(\d{1,2})\s*([A-Za-z]{3,9})\.?,?\s*(\d{4})/, "$1 $2 $3")
    .replace(/\./g, "");
  const monthMatch = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthMatch) {
    const months: Record<string, number> = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };
    const month = months[monthMatch[2].toLowerCase()];
    if (month) {
      return `${monthMatch[3]}-${String(month).padStart(2, "0")}-${String(Number(monthMatch[1])).padStart(2, "0")}`;
    }
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const normalizeAwb = (awb: string) => {
  const digits = awb.replace(/[^\d]/g, "");
  // OCR이 AWB 앞의 표 선 등을 숫자 1로 잘못 읽어 12자리로 만드는 경우가 있다.
  // 항공사 Prefix(618)가 시작되는 마지막 위치부터 정확히 11자리만 사용한다.
  const prefixIndex = digits.lastIndexOf("618");
  const prefixedCandidate = prefixIndex >= 0 ? digits.slice(prefixIndex, prefixIndex + 11) : "";
  const awbDigits = prefixedCandidate.length === 11
    ? prefixedCandidate
    : digits.length === 12 && digits.startsWith("1")
      ? digits.slice(1)
      : digits;
  return awbDigits.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3");
};

export const numericOrBlank = (value: number | "") => value === "" ? undefined : Number(value);
