export const SIZE_KEYS = ["8", "10", "12", "14", "16", "18", "20", "22"] as const;
export type SizeKey = (typeof SIZE_KEYS)[number];

export interface PackingListItem {
  id: string;
  customer: string;
  productName: string;
  variety: string;
  grade: string;
  sizeKg: number | "";
  quantities: Record<SizeKey, number | "">;
  totalQuantity: number | "";
  netWeight: number | "";
  grossWeight: number | "";
  remarks: string;
}

export interface PackingListData {
  date: string;
  invoiceNo: string;
  flight: string;
  destination: string;
  shipBy: string;
  awbNo: string;
  items: PackingListItem[];
}

export interface OcrResult {
  rawText: string;
  data: PackingListData;
  confidence: number;
}

export interface OcrProgress {
  page: number;
  totalPages: number;
  percent: number;
  status: string;
}
