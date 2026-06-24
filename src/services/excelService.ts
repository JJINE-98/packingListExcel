import * as XLSX from "xlsx";
import { excelMapping } from "../config/excelMapping";
import type { PackingListData } from "../types/packingList";
import { excelSerialFromDate, normalizeAwb } from "../utils/excelUtils";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/shipping-template.xlsx`;

function setValue(sheet: XLSX.WorkSheet, address: string, value: XLSX.CellObject["v"], type?: XLSX.ExcelDataType) {
  const existing = sheet[address] ?? {};
  sheet[address] = { ...existing, v: value, t: type ?? (typeof value === "number" ? "n" : "s") };
}

export async function generateShippingWorkbook(data: PackingListData): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error(`Excel 템플릿을 불러오지 못했습니다. (${response.status})`);
  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellStyles: true, cellDates: true });
  const sheet = workbook.Sheets[excelMapping.sheetName];
  if (!sheet) throw new Error(`템플릿에서 '${excelMapping.sheetName}' 시트를 찾을 수 없습니다.`);

  const item = data.items[0];
  if (!item) throw new Error("출고할 상품 행이 없습니다.");
  const aggregated = data.items.reduce((result, current) => {
    for (const size of ["10", "12", "14", "16", "18"] as const) {
      result.quantities[size] += Number(current.quantities[size] || 0);
    }
    result.totalQuantity += Number(current.totalQuantity || 0);
    const label = [current.variety, current.grade].filter(Boolean).join(" ") || current.productName;
    if (label && !result.products.includes(label)) result.products.push(label);
    if (current.remarks && !result.remarks.includes(current.remarks)) result.remarks.push(current.remarks);
    return result;
  }, {
    quantities: { "10": 0, "12": 0, "14": 0, "16": 0, "18": 0 },
    totalQuantity: 0,
    products: [] as string[],
    remarks: [] as string[],
  });
  const awb = normalizeAwb(data.awbNo);
  const sizeTotal = Object.values(aggregated.quantities).reduce((sum, value) => sum + value, 0);
  const totalQty = aggregated.totalQuantity || sizeTotal;
  const remarks = aggregated.remarks.join(" / ");

  const previousRowTotal = Number(sheet[excelMapping.totalQty]?.v || 0);
  const previousGrandTotal = Number(sheet[excelMapping.totals.totalQty]?.v || 0);
  const dateValue = excelSerialFromDate(data.date);
  setValue(sheet, excelMapping.date, dateValue, typeof dateValue === "number" ? "n" : "s");
  if (typeof dateValue === "number") sheet[excelMapping.date].z = "mm\"월\"dd\"일\"";
  setValue(sheet, excelMapping.awbDescription, `${awb}(${totalQty}ct)${remarks}`.trim());
  setValue(sheet, excelMapping.awbHeader, data.awbNo.trim() || awb);
  setValue(sheet, excelMapping.productHeader, aggregated.products.join(" / "));
  setValue(sheet, excelMapping.size10, aggregated.quantities["10"], "n");
  setValue(sheet, excelMapping.size12, aggregated.quantities["12"], "n");
  setValue(sheet, excelMapping.size14, aggregated.quantities["14"], "n");
  setValue(sheet, excelMapping.size16, aggregated.quantities["16"], "n");
  setValue(sheet, excelMapping.size18, aggregated.quantities["18"], "n");
  setValue(sheet, excelMapping.totalQty, Number(totalQty), "n");
  setValue(sheet, excelMapping.remarks, remarks);

  // 기존 템플릿의 일부 합계 셀이 캐시값으로 저장되어 있어 대상 블록만 명시적으로 갱신한다.
  setValue(sheet, excelMapping.totals.size10, aggregated.quantities["10"], "n");
  setValue(sheet, excelMapping.totals.size12, aggregated.quantities["12"], "n");
  setValue(sheet, excelMapping.totals.size14, aggregated.quantities["14"], "n");
  setValue(sheet, excelMapping.totals.size16, aggregated.quantities["16"], "n");
  setValue(sheet, excelMapping.totals.size18, aggregated.quantities["18"], "n");
  setValue(sheet, excelMapping.totals.totalQty, previousGrandTotal - previousRowTotal + Number(totalQty), "n");

  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
  return new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
