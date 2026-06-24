export function excelSerialFromDate(value: string): number | string {
  const normalized = value
    .replace(/(\d{1,2})\s+([A-Za-z]{3})\.?,\s*(\d{4})/, "$1 $2 $3")
    .replace(/\./g, "");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  const utc = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

export const normalizeAwb = (awb: string) =>
  awb.replace(/[^\d]/g, "").replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3");

export const numericOrBlank = (value: number | "") => value === "" ? undefined : Number(value);
