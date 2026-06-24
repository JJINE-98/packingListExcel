/**
 * 첨부 템플릿의 "출고요청서" 시트를 직접 분석한 실제 주소.
 * 샘플 AWB 618-5548-6071 블록은 BH:BL, 데이터 행은 27행이다.
 */
export const excelMapping = {
  sheetName: "출고요청서",
  targetRow: 27,
  date: "C27",
  awbDescription: "D27",
  awbHeader: "BH14",
  productHeader: "BH15",
  size10: "BH27",
  size12: "BI27",
  size14: "BJ27",
  size16: "BK27",
  size18: "BL27",
  totalQty: "BS27",
  remarks: "BT27",
  totals: {
    size10: "BH30",
    size12: "BI30",
    size14: "BJ30",
    size16: "BK30",
    size18: "BL30",
    totalQty: "BS30",
  },
} as const;

export const unsupportedTemplateFields = [
  "invoiceNo",
  "flight",
  "destination",
  "shipBy",
  "size8",
  "size20",
  "size22",
  "netWeight",
  "grossWeight",
] as const;
