import * as XLSX from "xlsx";
import { excelMapping } from "../config/excelMapping";
import type { PackingListData } from "../types/packingList";
import { excelSerialFromDate, normalizeAwb } from "../utils/excelUtils";
import { generateManagedWorkbookXml } from "./ooxmlExcelService";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/shipping-template.xlsx`;
const TARGET_SHEET = "출고요청서";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface AggregatedPackingList {
  quantities: Record<"10" | "12" | "14" | "16" | "18", number>;
  totalQuantity: number;
  products: string[];
}

interface DynamicLayout {
  headerRow: number;
  dataStartRow: number;
  summaryRow: number;
  awbStartColumn: number;
  sizeColumns: Partial<Record<"10" | "12" | "14" | "16" | "18", number>>;
  totalColumn: number;
  remarksColumn?: number;
}

function setValue(sheet: XLSX.WorkSheet, address: string, value: XLSX.CellObject["v"], type?: XLSX.ExcelDataType) {
  const existing = sheet[address] ?? {};
  sheet[address] = { ...existing, v: value, t: type ?? (typeof value === "number" ? "n" : "s") };
}

function aggregateData(data: PackingListData): AggregatedPackingList {
  return data.items.reduce<AggregatedPackingList>((result, current) => {
    for (const size of ["10", "12", "14", "16", "18"] as const) {
      result.quantities[size] += Number(current.quantities[size] || 0);
    }
    result.totalQuantity += Number(current.totalQuantity || 0);
    const label = [current.variety, current.grade].filter(Boolean).join(" ") || current.productName;
    if (label && !result.products.includes(label)) result.products.push(label);
    return result;
  }, {
    quantities: { "10": 0, "12": 0, "14": 0, "16": 0, "18": 0 },
    totalQuantity: 0,
    products: [],
  });
}

function cellText(sheet: XLSX.WorkSheet, row: number, column: number) {
  return String(sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })]?.v ?? "").trim();
}

function normalizedDigits(value: string) {
  return value.replace(/\D/g, "");
}

function findHeaderRow(sheet: XLSX.WorkSheet, range: XLSX.Range) {
  for (let row = range.s.r + 1; row <= Math.min(range.e.r + 1, 60); row += 1) {
    for (let column = range.s.c + 1; column <= Math.min(range.e.c + 1, 12); column += 1) {
      if (/B\/?L\s*No\.?/i.test(cellText(sheet, row, column))) return row;
    }
  }
  throw new Error("'출고요청서' 시트에서 B/L No. 헤더를 찾을 수 없습니다.");
}

function findSummaryRow(sheet: XLSX.WorkSheet, range: XLSX.Range, dataStartRow: number) {
  for (let row = dataStartRow + 1; row <= range.e.r + 1; row += 1) {
    let sumFormulaCount = 0;
    for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
      const formula = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })]?.f;
      if (formula && /\bSUM\s*\(/i.test(formula)) sumFormulaCount += 1;
    }
    if (sumFormulaCount >= 3) return row;
  }

  for (let row = dataStartRow + 1; row <= range.e.r + 1; row += 1) {
    const rowText = Array.from(
      { length: Math.min(range.e.c + 1, 12) },
      (_, column) => cellText(sheet, row, column + 1),
    ).join(" ");
    if (/\bBalance\b|TOTAL|합계/i.test(rowText)) return row;
  }
  throw new Error("출고 데이터 아래의 합계 행을 찾을 수 없습니다.");
}

function findAwbColumn(sheet: XLSX.WorkSheet, headerRow: number, range: XLSX.Range, awbNo: string) {
  const target = normalizedDigits(awbNo);
  for (let row = Math.max(1, headerRow - 4); row < headerRow; row += 1) {
    for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
      const digits = normalizedDigits(cellText(sheet, row, column));
      if (digits.length >= 10 && digits.includes(target)) return column;
    }
  }
  throw new Error(`Excel의 출고요청서에서 AWB ${awbNo} 열을 찾을 수 없습니다.`);
}

function findSizeColumns(sheet: XLSX.WorkSheet, headerRow: number, awbStartColumn: number) {
  const columns: DynamicLayout["sizeColumns"] = {};
  for (let column = awbStartColumn; column < awbStartColumn + 10; column += 1) {
    const value = Number(cellText(sheet, headerRow, column));
    if ([10, 12, 14, 16, 18].includes(value)) {
      columns[String(value) as keyof DynamicLayout["sizeColumns"]] = column;
      if (Object.keys(columns).length === 5) break;
    } else if (column > awbStartColumn && Object.keys(columns).length > 0) {
      break;
    }
  }
  if (Object.keys(columns).length === 0) {
    throw new Error(`AWB 열 아래에서 사이즈 헤더(10, 12, 14, 16, 18)를 찾을 수 없습니다.`);
  }
  return columns;
}

function findLabeledColumn(sheet: XLSX.WorkSheet, headerRow: number, range: XLSX.Range, label: RegExp) {
  for (let row = Math.max(1, headerRow - 3); row <= headerRow; row += 1) {
    for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
      if (label.test(cellText(sheet, row, column))) return column;
    }
  }
  return undefined;
}

function isRowEmpty(sheet: XLSX.WorkSheet, row: number) {
  // A열의 순번은 무시하고 실제 출고 데이터가 기록되는 B:D만 확인한다.
  for (let column = 2; column <= 4; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
    if (cell && (cell.v !== undefined && cell.v !== null && cell.v !== "" || cell.f)) return false;
  }
  return true;
}

function findNextDataRow(sheet: XLSX.WorkSheet, dataStartRow: number, summaryRow: number) {
  let lastPopulatedRow = dataStartRow - 1;
  for (let row = dataStartRow; row < summaryRow; row += 1) {
    if (!isRowEmpty(sheet, row)) lastPopulatedRow = row;
  }
  return Math.max(dataStartRow, lastPopulatedRow + 1);
}

function cloneCell(cell: XLSX.CellObject | undefined) {
  if (!cell) return undefined;
  return structuredClone(cell);
}

function applyDataRowStyle(
  sheet: XLSX.WorkSheet,
  targetRow: number,
  range: XLSX.Range,
  dataStartRow: number,
) {
  for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
    const address = XLSX.utils.encode_cell({ r: targetRow - 1, c: column - 1 });
    const target = sheet[address];
    if (target?.s !== undefined) continue;

    for (let row = targetRow - 1; row >= dataStartRow; row -= 1) {
      const source = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (!source) continue;
      const styled = cloneCell(source)!;
      delete styled.v;
      delete styled.w;
      delete styled.f;
      delete styled.h;
      delete styled.l;
      delete styled.c;
      styled.t = "z";
      sheet[address] = { ...styled, ...target };
      break;
    }
  }
  if (sheet["!rows"] && !sheet["!rows"]![targetRow - 1]) {
    sheet["!rows"]![targetRow - 1] = structuredClone(
      sheet["!rows"]![Math.max(dataStartRow, targetRow - 1) - 1] ?? {},
    );
  }
}

function adjustMovedFormula(formula: string, insertionRow: number) {
  return formula.replace(
    /(\$?[A-Z]{1,3}\$?)(\d+)(?::(\$?[A-Z]{1,3}\$?)(\d+))?/g,
    (match, firstColumn: string, firstRowText: string, secondColumn?: string, secondRowText?: string) => {
      const firstRow = Number(firstRowText);
      if (secondColumn && secondRowText) {
        const secondRow = Number(secondRowText);
        const adjustedFirst = firstRow >= insertionRow ? firstRow + 1 : firstRow;
        const adjustedSecond = secondRow >= insertionRow
          ? secondRow + 1
          : secondRow === insertionRow - 1
            ? insertionRow
            : secondRow;
        return `${firstColumn}${adjustedFirst}:${secondColumn}${adjustedSecond}`;
      }
      return `${firstColumn}${firstRow >= insertionRow ? firstRow + 1 : firstRow}`;
    },
  );
}

function insertWorksheetRow(
  sheet: XLSX.WorkSheet,
  insertionRow: number,
  range: XLSX.Range,
  dataStartRow: number,
) {
  for (let row = range.e.r + 1; row >= insertionRow; row -= 1) {
    for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
      const sourceAddress = XLSX.utils.encode_cell({ r: row - 1, c: column - 1 });
      const destinationAddress = XLSX.utils.encode_cell({ r: row, c: column - 1 });
      const source = cloneCell(sheet[sourceAddress]);
      if (source) {
        sheet[destinationAddress] = source;
      } else {
        delete sheet[destinationAddress];
      }
    }
  }

  for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
    let styleSource: XLSX.CellObject | undefined;
    for (let row = insertionRow - 1; row >= dataStartRow; row -= 1) {
      const candidate = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (candidate) {
        styleSource = candidate;
        break;
      }
    }
    const address = XLSX.utils.encode_cell({ r: insertionRow - 1, c: column - 1 });
    if (styleSource) {
      const emptyCell = cloneCell(styleSource)!;
      delete emptyCell.v;
      delete emptyCell.w;
      delete emptyCell.f;
      delete emptyCell.h;
      delete emptyCell.l;
      delete emptyCell.c;
      emptyCell.t = "z";
      sheet[address] = emptyCell;
    } else {
      delete sheet[address];
    }
  }

  if (sheet["!rows"]) {
    sheet["!rows"]!.splice(
      insertionRow - 1,
      0,
      structuredClone(sheet["!rows"]![Math.max(dataStartRow, insertionRow - 1) - 1] ?? {}),
    );
  }
  if (sheet["!merges"]) {
    sheet["!merges"] = sheet["!merges"]!.map((merge) => {
      const next = structuredClone(merge);
      if (next.s.r >= insertionRow - 1) {
        next.s.r += 1;
        next.e.r += 1;
      } else if (next.e.r >= insertionRow - 1) {
        next.e.r += 1;
      }
      return next;
    });
  }

  range.e.r += 1;
  sheet["!ref"] = XLSX.utils.encode_range(range);

  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell?.f) cell.f = adjustMovedFormula(cell.f, insertionRow);
    }
  }
}

function analyzeDynamicLayout(sheet: XLSX.WorkSheet, awbNo: string): DynamicLayout {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const headerRow = findHeaderRow(sheet, range);
  const dataStartRow = headerRow + 1;
  const summaryRow = findSummaryRow(sheet, range, dataStartRow);
  const awbStartColumn = findAwbColumn(sheet, headerRow, range, awbNo);
  const sizeColumns = findSizeColumns(sheet, headerRow, awbStartColumn);
  const totalColumn = findLabeledColumn(sheet, headerRow, range, /^(합계|Total)$/i) ?? XLSX.utils.decode_col("BS");
  const remarksColumn = findLabeledColumn(sheet, headerRow, range, /^(비고|Remarks)$/i);
  return { headerRow, dataStartRow, summaryRow, awbStartColumn, sizeColumns, totalColumn, remarksColumn };
}

function findOrCreateDataRow(sheet: XLSX.WorkSheet, layout: DynamicLayout) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const nextRow = findNextDataRow(sheet, layout.dataStartRow, layout.summaryRow);
  if (nextRow < layout.summaryRow) {
    applyDataRowStyle(sheet, nextRow, range, layout.dataStartRow);
    return nextRow;
  }
  insertWorksheetRow(sheet, layout.summaryRow, range, layout.dataStartRow);
  return layout.summaryRow;
}

function populateDynamicRow(sheet: XLSX.WorkSheet, row: number, layout: DynamicLayout, data: PackingListData) {
  const aggregated = aggregateData(data);
  const quantitySum = Object.values(aggregated.quantities).reduce((sum, value) => sum + value, 0);
  const totalQuantity = aggregated.totalQuantity || quantitySum;
  const awb = normalizeAwb(data.awbNo);
  const dateValue = excelSerialFromDate(data.date);

  setValue(sheet, `C${row}`, dateValue, typeof dateValue === "number" ? "n" : "s");
  if (typeof dateValue === "number") sheet[`C${row}`].z = "mm\"월\"dd\"일\"";
  setValue(sheet, `D${row}`, `${awb}(${totalQuantity}ct)`);

  for (const size of ["10", "12", "14", "16", "18"] as const) {
    const column = layout.sizeColumns[size];
    if (column) {
      setValue(sheet, XLSX.utils.encode_cell({ r: row - 1, c: column - 1 }), aggregated.quantities[size], "n");
    }
  }
  setValue(sheet, XLSX.utils.encode_cell({ r: row - 1, c: layout.totalColumn - 1 }), totalQuantity, "n");
}

function enableExcelRecalculation(workbook: XLSX.WorkBook) {
  workbook.Workbook ??= {};
  const workbookMetadata = workbook.Workbook as typeof workbook.Workbook & {
    CalcPr?: Record<string, string>;
  };
  workbookMetadata.CalcPr = {
    ...workbookMetadata.CalcPr,
    calcMode: "auto",
    fullCalcOnLoad: "1",
    forceFullCalc: "1",
  };
}

async function readWorkbook(file?: File) {
  if (file) {
    return XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellStyles: true,
      cellDates: true,
      cellFormula: true,
      sheetStubs: true,
    });
  }
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error(`Excel 템플릿을 불러오지 못했습니다. (${response.status})`);
  return XLSX.read(await response.arrayBuffer(), {
    type: "array",
    cellStyles: true,
    cellDates: true,
    cellFormula: true,
    sheetStubs: true,
  });
}

function generateFromBundledTemplate(workbook: XLSX.WorkBook, data: PackingListData) {
  const sheet = workbook.Sheets[excelMapping.sheetName];
  if (!sheet) throw new Error(`템플릿에서 '${excelMapping.sheetName}' 시트를 찾을 수 없습니다.`);
  const aggregated = aggregateData(data);
  const sizeTotal = Object.values(aggregated.quantities).reduce((sum, value) => sum + value, 0);
  const totalQty = aggregated.totalQuantity || sizeTotal;
  const awb = normalizeAwb(data.awbNo);
  const previousRowTotal = Number(sheet[excelMapping.totalQty]?.v || 0);
  const previousGrandTotal = Number(sheet[excelMapping.totals.totalQty]?.v || 0);
  const dateValue = excelSerialFromDate(data.date);

  setValue(sheet, excelMapping.date, dateValue, typeof dateValue === "number" ? "n" : "s");
  if (typeof dateValue === "number") sheet[excelMapping.date].z = "mm\"월\"dd\"일\"";
  setValue(sheet, excelMapping.awbDescription, `${awb}(${totalQty}ct)`);
  setValue(sheet, excelMapping.awbHeader, awb);
  setValue(sheet, excelMapping.productHeader, "", "s");
  setValue(sheet, excelMapping.size10, aggregated.quantities["10"], "n");
  setValue(sheet, excelMapping.size12, aggregated.quantities["12"], "n");
  setValue(sheet, excelMapping.size14, aggregated.quantities["14"], "n");
  setValue(sheet, excelMapping.size16, aggregated.quantities["16"], "n");
  setValue(sheet, excelMapping.size18, aggregated.quantities["18"], "n");
  setValue(sheet, excelMapping.totalQty, totalQty, "n");
  setValue(sheet, excelMapping.totals.size10, aggregated.quantities["10"], "n");
  setValue(sheet, excelMapping.totals.size12, aggregated.quantities["12"], "n");
  setValue(sheet, excelMapping.totals.size14, aggregated.quantities["14"], "n");
  setValue(sheet, excelMapping.totals.size16, aggregated.quantities["16"], "n");
  setValue(sheet, excelMapping.totals.size18, aggregated.quantities["18"], "n");
  setValue(sheet, excelMapping.totals.totalQty, previousGrandTotal - previousRowTotal + totalQty, "n");
}

export async function generateShippingWorkbook(documents: PackingListData[], managedExcel?: File | null): Promise<Blob> {
  const usesBundledTemplate = !managedExcel;
  let source = managedExcel;
  if (!source) {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error(`Excel 템플릿을 불러오지 못했습니다. (${response.status})`);
    source = new File([await response.blob()], "shipping-template.xlsx", { type: MIME_XLSX });
  }

  let output: Blob = source;
  for (const document of documents) {
    for (const item of document.items) {
      const rowData: PackingListData = {
        ...document,
        items: [structuredClone(item)],
      };
      output = await generateManagedWorkbookXml(source, rowData, {
        blankQuarantineLoss: usesBundledTemplate,
      });
      source = new File([output], source.name, { type: MIME_XLSX });
    }
  }
  return output;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 3000);
}
