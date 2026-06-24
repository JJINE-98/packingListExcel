import JSZip from "jszip";
import * as XLSX from "xlsx";
import type { PackingListData } from "../types/packingList";
import { excelSerialFromDate, normalizeAwb } from "../utils/excelUtils";

const TARGET_SHEET = "출고요청서";
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

interface DynamicLayout {
  headerRow: number;
  dataStartRow: number;
  summaryRow: number;
  sizeColumns: Partial<Record<"10" | "12" | "14" | "16" | "18", number>>;
  totalColumn: number;
  remarksColumn?: number;
}

interface AggregatedPackingList {
  quantities: Record<"10" | "12" | "14" | "16" | "18", number>;
  totalQuantity: number;
  remarks: string[];
}

function aggregateData(data: PackingListData): AggregatedPackingList {
  return data.items.reduce<AggregatedPackingList>((result, current) => {
    for (const size of ["10", "12", "14", "16", "18"] as const) {
      result.quantities[size] += Number(current.quantities[size] || 0);
    }
    result.totalQuantity += Number(current.totalQuantity || 0);
    if (current.remarks && !result.remarks.includes(current.remarks)) result.remarks.push(current.remarks);
    return result;
  }, {
    quantities: { "10": 0, "12": 0, "14": 0, "16": 0, "18": 0 },
    totalQuantity: 0,
    remarks: [],
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
  if (Object.keys(columns).length === 0) throw new Error("AWB 열 아래의 사이즈 헤더를 찾을 수 없습니다.");
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

function isRowEmpty(sheet: XLSX.WorkSheet, row: number, range: XLSX.Range) {
  for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
    if (cell && (cell.v !== undefined && cell.v !== null && cell.v !== "" || cell.f)) return false;
  }
  return true;
}

function analyzeLayout(workbook: XLSX.WorkBook, awbNo: string) {
  if (workbook.SheetNames[0] !== TARGET_SHEET || !workbook.Sheets[TARGET_SHEET]) {
    throw new Error(`첨부 Excel의 첫 번째 시트 이름이 '${TARGET_SHEET}'이어야 합니다.`);
  }
  const sheet = workbook.Sheets[TARGET_SHEET];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const headerRow = findHeaderRow(sheet, range);
  const dataStartRow = headerRow + 1;
  const summaryRow = findSummaryRow(sheet, range, dataStartRow);
  const awbStartColumn = findAwbColumn(sheet, headerRow, range, awbNo);
  const sizeColumns = findSizeColumns(sheet, headerRow, awbStartColumn);
  const totalColumn = findLabeledColumn(sheet, headerRow, range, /^(합계|Total)$/i) ?? XLSX.utils.decode_col("BS") + 1;
  const remarksColumn = findLabeledColumn(sheet, headerRow, range, /^(비고|Remarks)$/i);
  let targetRow = summaryRow;
  let insertRow = true;
  for (let row = dataStartRow; row < summaryRow; row += 1) {
    if (isRowEmpty(sheet, row, range)) {
      targetRow = row;
      insertRow = false;
      break;
    }
  }
  return {
    layout: { headerRow, dataStartRow, summaryRow, sizeColumns, totalColumn, remarksColumn },
    targetRow,
    insertRow,
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rowRegex(row: number) {
  return new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*>[\\s\\S]*?<\\/row>`);
}

function getRowXml(xml: string, row: number) {
  return xml.match(rowRegex(row))?.[0] ?? "";
}

function getCellXml(rowXml: string, address: string) {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rowXml.match(new RegExp(`<c\\b[^>]*\\br="${escaped}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`))?.[0] ?? "";
}

function styleAttribute(cellXml: string) {
  return cellXml.match(/\bs="(\d+)"/)?.[1];
}

function columnNumber(address: string) {
  return XLSX.utils.decode_col(address.replace(/\d/g, "")) + 1;
}

function emptyStyledCell(cellXml: string, address: string) {
  const style = styleAttribute(cellXml);
  return `<c r="${address}"${style ? ` s="${style}"` : ""}/>`;
}

function cloneStyledRow(xml: string, sourceRow: number, targetRow: number) {
  const source = getRowXml(xml, sourceRow);
  if (!source) return `<row r="${targetRow}"></row>`;
  const opening = source.match(/^<row\b[^>]*>/)?.[0] ?? `<row r="${targetRow}">`;
  const targetOpening = opening.replace(/\br="\d+"/, `r="${targetRow}"`);
  const cells = [...source.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)]
    .map((match) => emptyStyledCell(match[0], `${match[1]}${targetRow}`));
  return `${targetOpening}${cells.join("")}</row>`;
}

function cloneStyledRowByColumn(
  xml: string,
  targetRow: number,
  dataStartRow: number,
) {
  const sourceRow = findStyleSourceRow(xml, targetRow - 1, dataStartRow);
  const source = getRowXml(xml, sourceRow);
  const opening = source.match(/^<row\b[^>]*>/)?.[0] ?? `<row r="${targetRow}">`;
  const targetOpening = opening.replace(/\br="\d+"/, `r="${targetRow}"`);
  const styles = new Map<string, string>();

  for (let row = targetRow - 1; row >= dataStartRow; row -= 1) {
    const rowXml = getRowXml(xml, row);
    for (const match of rowXml.matchAll(/<c\b([^>]*)>/g)) {
      const column = match[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      const style = match[1].match(/\bs="(\d+)"/)?.[1];
      if (column && style && !styles.has(column)) {
        styles.set(column, `<c r="${column}${row}" s="${style}"/>`);
      }
    }
  }

  const cells = [...styles.entries()]
    .sort(([first], [second]) => XLSX.utils.decode_col(first) - XLSX.utils.decode_col(second))
    .map(([column, cellXml]) => emptyStyledCell(cellXml, `${column}${targetRow}`));
  return `${targetOpening}${cells.join("")}</row>`;
}

function adjustFormulaReferences(value: string, insertionRow: number) {
  return value.replace(
    /(\$?[A-Z]{1,3}\$?)(\d+)(?::(\$?[A-Z]{1,3}\$?)(\d+))?/g,
    (_match, firstColumn: string, firstRowText: string, secondColumn?: string, secondRowText?: string) => {
      const firstRow = Number(firstRowText);
      if (secondColumn && secondRowText) {
        const secondRow = Number(secondRowText);
        const nextFirst = firstRow >= insertionRow ? firstRow + 1 : firstRow;
        const nextSecond = secondRow >= insertionRow
          ? secondRow + 1
          : secondRow === insertionRow - 1 ? insertionRow : secondRow;
        return `${firstColumn}${nextFirst}:${secondColumn}${nextSecond}`;
      }
      return `${firstColumn}${firstRow >= insertionRow ? firstRow + 1 : firstRow}`;
    },
  );
}

function shiftRows(xml: string, insertionRow: number) {
  let shifted = xml.replace(
    /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g,
    (rowXml, rowText: string) => {
      const row = Number(rowText);
      if (row < insertionRow) return rowXml;
      return rowXml
        .replace(/\br="\d+"/, `r="${row + 1}"`)
        .replace(/\br="([A-Z]+)(\d+)"/g, (_match: string, column: string, cellRow: string) =>
          `r="${column}${Number(cellRow) + 1}"`,
        );
    },
  );
  shifted = shifted.replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_match, attributes, formula) =>
    `<f${attributes}>${adjustFormulaReferences(formula, insertionRow)}</f>`,
  );
  shifted = shifted.replace(/\b(ref|sqref)="([^"]+)"/g, (_match, attribute, ref) =>
    `${attribute}="${adjustFormulaReferences(ref, insertionRow)}"`,
  );
  return shifted;
}

function upsertCell(rowXml: string, address: string, value: string | number, fallbackStyle?: string) {
  const existing = getCellXml(rowXml, address);
  let cell: string;
  if (typeof value === "number") {
    const style = styleAttribute(existing) ?? fallbackStyle;
    cell = `<c r="${address}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  } else {
    const style = styleAttribute(existing) ?? fallbackStyle;
    cell = `<c r="${address}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  }
  if (existing) return rowXml.replace(existing, cell);

  const cells = [...rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)];
  const targetColumn = columnNumber(address);
  const next = cells.find((match) => columnNumber(match[1]) > targetColumn);
  return next
    ? rowXml.replace(next[0], `${cell}${next[0]}`)
    : rowXml.replace(/<\/row>$/, `${cell}</row>`);
}

function collectColumnStyles(
  xml: string,
  startRow: number,
  endRow: number,
) {
  const styles = new Map<string, string>();
  for (let row = endRow; row >= startRow; row -= 1) {
    const rowXml = getRowXml(xml, row);
    for (const match of rowXml.matchAll(/<c\b([^>]*)>/g)) {
      const address = match[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      const style = match[1].match(/\bs="(\d+)"/)?.[1];
      if (address && style && !styles.has(address)) styles.set(address, style);
    }
  }
  return styles;
}

function styleMissingCells(rowXml: string, sourceRowXml: string, targetRow: number) {
  const styledCells = [...sourceRowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)];
  let result = rowXml;
  for (const sourceCell of styledCells) {
    const address = `${sourceCell[1]}${targetRow}`;
    if (!getCellXml(result, address)) {
      result = upsertCell(result, address, "");
      const created = getCellXml(result, address);
      result = result.replace(created, emptyStyledCell(sourceCell[0], address));
    }
  }
  return result;
}

function findStyleSourceRow(xml: string, startRow: number, dataStartRow: number) {
  let bestRow = dataStartRow;
  let bestScore = -1;
  for (let row = startRow; row >= dataStartRow; row -= 1) {
    const rowXml = getRowXml(xml, row);
    const styledCells = (rowXml.match(/<c\b[^>]*\bs="\d+"/g) ?? []).length;
    const valueCells = (rowXml.match(/<c\b[^>]*(?:><v>|t="s"|t="inlineStr")/g) ?? []).length;
    const score = styledCells * 2 + valueCells;
    if (score > bestScore) {
      bestRow = row;
      bestScore = score;
    }
  }
  return bestRow;
}

function populateRow(
  rowXml: string,
  row: number,
  layout: DynamicLayout,
  data: PackingListData,
  columnStyles: Map<string, string>,
) {
  const aggregated = aggregateData(data);
  const quantitySum = Object.values(aggregated.quantities).reduce((sum, value) => sum + value, 0);
  const totalQuantity = aggregated.totalQuantity || quantitySum;
  const remarks = aggregated.remarks.join(" / ");
  const awb = normalizeAwb(data.awbNo);
  const date = excelSerialFromDate(data.date);
  let result = upsertCell(rowXml, `C${row}`, date, columnStyles.get("C"));
  result = upsertCell(result, `D${row}`, `${awb}(${totalQuantity}ct)${remarks}`.trim(), columnStyles.get("D"));
  for (const size of ["10", "12", "14", "16", "18"] as const) {
    const column = layout.sizeColumns[size];
    if (column) {
      const columnName = XLSX.utils.encode_col(column - 1);
      result = upsertCell(result, `${columnName}${row}`, aggregated.quantities[size], columnStyles.get(columnName));
    }
  }
  const totalColumnName = XLSX.utils.encode_col(layout.totalColumn - 1);
  result = upsertCell(result, `${totalColumnName}${row}`, totalQuantity, columnStyles.get(totalColumnName));
  if (layout.remarksColumn) {
    const remarksColumnName = XLSX.utils.encode_col(layout.remarksColumn - 1);
    result = upsertCell(result, `${remarksColumnName}${row}`, remarks, columnStyles.get(remarksColumnName));
  }
  return result;
}

function resolveFirstSheetPath(workbookXml: string, relationshipsXml: string) {
  const firstSheet = workbookXml.match(/<sheet\b[^>]*\bname="출고요청서"[^>]*\br:id="([^"]+)"/);
  if (!firstSheet) throw new Error("workbook.xml에서 출고요청서 시트를 찾을 수 없습니다.");
  const relationshipId = firstSheet[1];
  const relationship = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .find((match) => new RegExp(`\\bId="${relationshipId}"`).test(match[0]));
  const target = relationship?.[0].match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error("출고요청서 시트 파일 경로를 찾을 수 없습니다.");
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

function removeCalcChain(zip: JSZip) {
  // 원본 관계와 패키지 무결성을 보존하기 위해 calcChain 파트도 유지한다.
  // Excel은 수정된 수식을 열 때 자동으로 다시 계산한다.
  void zip;
}

function enableWorkbookRecalculation(workbookXml: string) {
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^>]*)\/>/, (_match, attributes: string) => {
      const cleaned = attributes
        .replace(/\scalcMode="[^"]*"/g, "")
        .replace(/\sfullCalcOnLoad="[^"]*"/g, "")
        .replace(/\sforceFullCalc="[^"]*"/g, "");
      return `<calcPr${cleaned} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
    });
  }
  return workbookXml.replace(
    /<\/workbook>$/,
    `<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
  );
}

export async function generateManagedWorkbookXml(file: File, data: PackingListData) {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellFormula: true,
    cellStyles: true,
    sheetStubs: true,
  });
  const { layout, targetRow, insertRow } = analyzeLayout(workbook, data.awbNo);
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relationshipsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relationshipsXml) throw new Error("Excel 통합문서 구조를 읽을 수 없습니다.");
  const sheetPath = resolveFirstSheetPath(workbookXml, relationshipsXml);
  let sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error("출고요청서 시트 XML을 읽을 수 없습니다.");

  const styleSourceRow = findStyleSourceRow(sheetXml, targetRow - 1, layout.dataStartRow);
  const columnStyles = collectColumnStyles(sheetXml, layout.dataStartRow, layout.summaryRow - 1);
  if (insertRow) {
    sheetXml = shiftRows(sheetXml, targetRow);
    const newRow = cloneStyledRowByColumn(sheetXml, targetRow, layout.dataStartRow);
    sheetXml = sheetXml.replace(getRowXml(sheetXml, targetRow + 1), `${newRow}${getRowXml(sheetXml, targetRow + 1)}`);
  } else {
    const current = getRowXml(sheetXml, targetRow) || `<row r="${targetRow}"></row>`;
    const styled = styleMissingCells(current, getRowXml(sheetXml, styleSourceRow), targetRow);
    if (getRowXml(sheetXml, targetRow)) {
      sheetXml = sheetXml.replace(getRowXml(sheetXml, targetRow), styled);
    } else {
      const nextRow = getRowXml(sheetXml, targetRow + 1);
      sheetXml = sheetXml.replace(nextRow, `${styled}${nextRow}`);
    }
  }

  const currentRow = getRowXml(sheetXml, targetRow);
  sheetXml = sheetXml.replace(currentRow, populateRow(currentRow, targetRow, layout, data, columnStyles));
  zip.file(sheetPath, sheetXml);
  zip.file("xl/workbook.xml", enableWorkbookRecalculation(workbookXml));
  removeCalcChain(zip);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
