import JSZip from "jszip";
import * as XLSX from "xlsx";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { PackingListData } from "../types/packingList";
import { excelSerialFromDate, normalizeAwb } from "../utils/excelUtils";

const TARGET_SHEET = "출고요청서";
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
type XmlDocument = ReturnType<DOMParser["parseFromString"]>;
type XmlElement = ReturnType<XmlDocument["createElementNS"]>;

interface DynamicLayout {
  headerRow: number;
  dataStartRow: number;
  summaryRow: number;
  sizeColumns: Partial<Record<"10" | "12" | "14" | "16" | "18", number>>;
  totalColumn: number;
  remarksColumn?: number;
  numericStyle?: string;
}

interface AwbBlockInsertion {
  insertionColumn: number;
  sourceColumn: number;
  width: number;
  dataStartRow: number;
  summaryRow: number;
  outboundStartRow: number;
  outboundEndRow: number;
}

interface AggregatedPackingList {
  quantities: Record<"10" | "12" | "14" | "16" | "18", number>;
  totalQuantity: number;
}

function aggregateData(data: PackingListData): AggregatedPackingList {
  return data.items.reduce<AggregatedPackingList>((result, current) => {
    for (const size of ["10", "12", "14", "16", "18"] as const) {
      result.quantities[size] += Number(current.quantities[size] || 0);
    }
    result.totalQuantity += Number(current.totalQuantity || 0);
    return result;
  }, {
    quantities: { "10": 0, "12": 0, "14": 0, "16": 0, "18": 0 },
    totalQuantity: 0,
  });
}

function cellText(sheet: XLSX.WorkSheet, row: number, column: number) {
  return String(sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })]?.v ?? "").trim();
}

function normalizedDigits(value: string) {
  return value.replace(/\D/g, "");
}

function sizeHeaderNumber(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?:\s*과)?$/);
  const size = match ? Number(match[1]) : Number(value);
  return [10, 12, 14, 16, 18].includes(size) ? size : undefined;
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
  return undefined;
}

function findSizeColumns(sheet: XLSX.WorkSheet, headerRow: number, awbStartColumn: number) {
  const columns: DynamicLayout["sizeColumns"] = {};
  for (let column = awbStartColumn; column < awbStartColumn + 10; column += 1) {
    const value = sizeHeaderNumber(cellText(sheet, headerRow, column));
    if (value) {
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

function findReusableAwbBlock(sheet: XLSX.WorkSheet, headerRow: number, beforeColumn: number) {
  let reusable: number | undefined;
  for (let column = 1; column <= beforeColumn - 4; column += 1) {
    const sizes = Array.from({ length: 5 }, (_, offset) => sizeHeaderNumber(cellText(sheet, headerRow, column + offset)));
    if (sizes.join(",") === "10,12,14,16,18") reusable = column;
  }
  if (reusable) return reusable;

  // 비어 있는 내장 템플릿에는 아직 AWB 10~18 블록이 없으므로,
  // 냉동 열 앞의 기존 상품 사이즈 영역을 스타일 원본으로 사용한다.
  let bestColumn: number | undefined;
  let bestScore = 0;
  let bestStartsWithNumber = false;
  for (let column = 1; column <= beforeColumn - 4; column += 1) {
    const values = Array.from(
      { length: 5 },
      (_, offset) => cellText(sheet, headerRow, column + offset),
    );
    const numericHeaders = values.filter((value) => sizeHeaderNumber(value)).length;
    const startsWithNumber = Boolean(sizeHeaderNumber(values[0]));
    if (
      numericHeaders > bestScore ||
      numericHeaders === bestScore && startsWithNumber && !bestStartsWithNumber
    ) {
      bestColumn = column;
      bestScore = numericHeaders;
      bestStartsWithNumber = startsWithNumber;
    }
  }
  if (bestColumn && bestScore >= 3) return bestColumn;
  throw new Error("새 AWB 열을 만들기 위한 상품 사이즈 블록을 찾을 수 없습니다.");
}

function isRowEmpty(sheet: XLSX.WorkSheet, row: number) {
  // A열은 순번 등 고정값이 들어 있을 수 있다.
  // 실제 출고 데이터 영역인 B:D가 모두 비어 있으면 재사용 가능한 행으로 본다.
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
  const nextRow = Math.max(dataStartRow, lastPopulatedRow + 1);
  return {
    targetRow: nextRow < summaryRow ? nextRow : summaryRow,
    insertRow: nextRow >= summaryRow,
  };
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
  const existingAwbColumn = findAwbColumn(sheet, headerRow, range, awbNo);
  const frozenColumn = findLabeledColumn(sheet, headerRow, range, /^냉동$/i);
  const originalTotalColumn = findLabeledColumn(sheet, headerRow, range, /^(합계|Total)$/i)
    ?? (frozenColumn ? frozenColumn + 1 : XLSX.utils.decode_col("BS") + 1);
  const originalRemarksColumn = findLabeledColumn(sheet, headerRow, range, /^(비고|Remarks)$/i)
    ?? originalTotalColumn + 1;
  const awbBlockInsertion = existingAwbColumn
    ? undefined
    : (() => {
        const insertionColumn = frozenColumn ?? originalTotalColumn;
        const sourceColumn = findReusableAwbBlock(sheet, headerRow, insertionColumn);
        const sourceName = XLSX.utils.encode_col(sourceColumn - 1);
        const outboundFormula = sheet[`${sourceName}${summaryRow + 1}`]?.f ?? "";
        const outboundRange = outboundFormula.match(/SUM\([^0-9]*(\d+):[^0-9]*(\d+)\)/i);
        return {
          insertionColumn,
          sourceColumn,
          width: 5,
          dataStartRow,
          summaryRow,
          outboundStartRow: Number(outboundRange?.[1] ?? summaryRow + 3),
          outboundEndRow: Number(outboundRange?.[2] ?? range.e.r + 1),
        };
      })();
  const awbStartColumn = existingAwbColumn ?? awbBlockInsertion!.insertionColumn;
  const sizeColumns = existingAwbColumn
    ? findSizeColumns(sheet, headerRow, existingAwbColumn)
    : { "10": awbStartColumn, "12": awbStartColumn + 1, "14": awbStartColumn + 2, "16": awbStartColumn + 3, "18": awbStartColumn + 4 };
  const totalColumn = originalTotalColumn + (awbBlockInsertion && originalTotalColumn >= awbBlockInsertion.insertionColumn ? awbBlockInsertion.width : 0);
  const remarksColumn = originalRemarksColumn === undefined
    ? undefined
    : originalRemarksColumn + (awbBlockInsertion && originalRemarksColumn >= awbBlockInsertion.insertionColumn ? awbBlockInsertion.width : 0);
  const { targetRow, insertRow } = findNextDataRow(sheet, dataStartRow, summaryRow);
  return {
    layout: { headerRow, dataStartRow, summaryRow, sizeColumns, totalColumn, remarksColumn },
    targetRow,
    insertRow,
    awbBlockInsertion,
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
  return rowXml.match(new RegExp(`<c\\b[^>]*\\br="${escaped}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`))?.[0] ?? "";
}

function styleAttribute(cellXml: string) {
  return cellXml.match(/\bs="(\d+)"/)?.[1];
}

function setCellStyle(rowXml: string, address: string, style: string) {
  const existing = getCellXml(rowXml, address);
  if (!existing) return rowXml;
  const styled = /\bs="\d+"/.test(existing)
    ? existing.replace(/\bs="\d+"/, `s="${style}"`)
    : existing.replace(/^<c\b/, `<c s="${style}"`);
  return rowXml.replace(existing, styled);
}

function columnNumber(address: string) {
  return XLSX.utils.decode_col(address.replace(/\d/g, "")) + 1;
}

function emptyStyledCell(cellXml: string, address: string) {
  const style = styleAttribute(cellXml);
  return `<c r="${address}"${style ? ` s="${style}"` : ""}/>`;
}

function clearRowsFromSharedString(
  sheetXml: string,
  sharedStringsXml: string,
  targetText: string,
) {
  const document = new DOMParser().parseFromString(sharedStringsXml, "application/xml");
  const targetIndexes = new Set<string>();
  const sharedStrings = Array.from(document.getElementsByTagNameNS(MAIN_NS, "si"));
  sharedStrings.forEach((item, index) => {
    if ((item.textContent ?? "").trim() === targetText) targetIndexes.add(String(index));
  });
  if (!targetIndexes.size) return sheetXml;

  const startRows = [...sheetXml.matchAll(
    /<c\b[^>]*\br="([A-Z]+)(\d+)"[^>]*\bt="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g,
  )]
    .filter((match) => targetIndexes.has(match[3]))
    .map((match) => Number(match[2]));
  if (!startRows.length) return sheetXml;
  const startRow = Math.min(...startRows);

  return sheetXml.replace(
    /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,
    (cellXml, address: string) => {
      const row = Number(address.replace(/\D/g, ""));
      return row >= startRow ? emptyStyledCell(cellXml, address) : cellXml;
    },
  );
}

function cloneStyledRow(xml: string, sourceRow: number, targetRow: number) {
  const source = getRowXml(xml, sourceRow);
  if (!source) return `<row r="${targetRow}"></row>`;
  const opening = source.match(/^<row\b[^>]*>/)?.[0] ?? `<row r="${targetRow}">`;
  const targetOpening = opening.replace(/\br="\d+"/, `r="${targetRow}"`);
  const cells = [...source.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)]
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
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const rows = Array.from(document.getElementsByTagNameNS(MAIN_NS, "row"));
  for (const rowElement of rows) {
    const row = Number(rowElement.getAttribute("r"));
    if (row < insertionRow) continue;
    const nextRow = row + 1;
    rowElement.setAttribute("r", String(nextRow));
    const cells = Array.from(rowElement.getElementsByTagNameNS(MAIN_NS, "c"));
    for (const cell of cells) {
      const address = cell.getAttribute("r");
      if (!address) continue;
      const column = address.match(/^[A-Z]+/)?.[0];
      if (column) cell.setAttribute("r", `${column}${nextRow}`);
    }
  }

  const formulas = Array.from(document.getElementsByTagNameNS(MAIN_NS, "f"));
  for (const formula of formulas) {
    const formulaText = formula.textContent;
    if (formulaText) {
      const adjusted = adjustFormulaReferences(formulaText, insertionRow);
      while (formula.firstChild) formula.removeChild(formula.firstChild);
      formula.appendChild(document.createTextNode(adjusted));
    }
    const sharedRange = formula.getAttribute("ref");
    if (sharedRange) formula.setAttribute("ref", adjustFormulaReferences(sharedRange, insertionRow));
  }

  for (const element of Array.from(document.getElementsByTagName("*"))) {
    for (const attribute of ["ref", "sqref"]) {
      if (element.localName === "f" && attribute === "ref") continue;
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, adjustFormulaReferences(value, insertionRow));
    }
  }
  return new XMLSerializer().serializeToString(document);
}

function adjustColumnReferences(value: string, insertionColumn: number, width: number, extendAtBoundary = true) {
  return value.replace(
    /(\$?)([A-Z]{1,3})(\$?\d+)(?::(\$?)([A-Z]{1,3})(\$?\d+))?/g,
    (_match, firstAbsolute: string, firstColumnText: string, firstRow: string, secondAbsolute?: string, secondColumnText?: string, secondRow?: string) => {
      const firstColumn = XLSX.utils.decode_col(firstColumnText) + 1;
      if (secondColumnText && secondRow) {
        const secondColumn = XLSX.utils.decode_col(secondColumnText) + 1;
        const shiftedFirst = extendAtBoundary && firstColumn === insertionColumn
          ? firstColumn
          : firstColumn >= insertionColumn ? firstColumn + width : firstColumn;
        const shiftedSecond = secondColumn >= insertionColumn
          ? secondColumn + width
          : extendAtBoundary && secondColumn === insertionColumn - 1 ? secondColumn + width : secondColumn;
        return `${firstAbsolute}${XLSX.utils.encode_col(shiftedFirst - 1)}${firstRow}:${secondAbsolute ?? ""}${XLSX.utils.encode_col(shiftedSecond - 1)}${secondRow}`;
      }
      const shiftedFirst = firstColumn >= insertionColumn ? firstColumn + width : firstColumn;
      return `${firstAbsolute}${XLSX.utils.encode_col(shiftedFirst - 1)}${firstRow}`;
    },
  );
}

function adjustDeletedColumnReferences(value: string, deletionColumn: number, width: number) {
  const deletionEnd = deletionColumn + width - 1;
  return value.replace(
    /(\$?)([A-Z]{1,3})(\$?\d+)(?::(\$?)([A-Z]{1,3})(\$?\d+))?/g,
    (_match, firstAbsolute: string, firstColumnText: string, firstRow: string, secondAbsolute?: string, secondColumnText?: string, secondRow?: string) => {
      const firstColumn = XLSX.utils.decode_col(firstColumnText) + 1;
      if (secondColumnText && secondRow) {
        const secondColumn = XLSX.utils.decode_col(secondColumnText) + 1;
        if (secondColumn < deletionColumn) return _match;
        if (firstColumn > deletionEnd) {
          return `${firstAbsolute}${XLSX.utils.encode_col(firstColumn - width - 1)}${firstRow}:${secondAbsolute ?? ""}${XLSX.utils.encode_col(secondColumn - width - 1)}${secondRow}`;
        }

        const survivingFirst = firstColumn < deletionColumn ? firstColumn : deletionColumn;
        const survivingSecond = secondColumn > deletionEnd
          ? secondColumn - width
          : deletionColumn - 1;
        if (survivingFirst > survivingSecond) return "#REF!";
        return `${firstAbsolute}${XLSX.utils.encode_col(survivingFirst - 1)}${firstRow}:${secondAbsolute ?? ""}${XLSX.utils.encode_col(survivingSecond - 1)}${secondRow}`;
      }

      if (firstColumn < deletionColumn) return _match;
      if (firstColumn > deletionEnd) {
        return `${firstAbsolute}${XLSX.utils.encode_col(firstColumn - width - 1)}${firstRow}`;
      }
      return "#REF!";
    },
  );
}

function rewriteColumnDefinitions(
  document: XmlDocument,
  transform: (column: number) => number | undefined,
) {
  const columns = document.getElementsByTagNameNS(MAIN_NS, "cols")[0];
  if (!columns) return;
  const definitions = new Map<number, Record<string, string>>();

  for (const columnElement of Array.from(columns.getElementsByTagNameNS(MAIN_NS, "col"))) {
    const minimum = Number(columnElement.getAttribute("min"));
    const maximum = Number(columnElement.getAttribute("max"));
    if (!minimum || !maximum) continue;
    const attributes: Record<string, string> = {};
    for (let index = 0; index < columnElement.attributes.length; index += 1) {
      const attribute = columnElement.attributes.item(index);
      if (attribute && attribute.name !== "min" && attribute.name !== "max") {
        attributes[attribute.name] = attribute.value;
      }
    }
    for (let column = minimum; column <= maximum; column += 1) {
      const nextColumn = transform(column);
      if (nextColumn !== undefined) definitions.set(nextColumn, attributes);
    }
  }

  while (columns.firstChild) columns.removeChild(columns.firstChild);
  const ordered = [...definitions.entries()].sort(([first], [second]) => first - second);
  let index = 0;
  while (index < ordered.length) {
    const [start, attributes] = ordered[index];
    let end = start;
    const signature = JSON.stringify(attributes);
    while (
      index + 1 < ordered.length &&
      ordered[index + 1][0] === end + 1 &&
      JSON.stringify(ordered[index + 1][1]) === signature
    ) {
      index += 1;
      end = ordered[index][0];
    }
    const element = document.createElementNS(MAIN_NS, "col");
    element.setAttribute("min", String(start));
    element.setAttribute("max", String(end));
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    columns.appendChild(element);
    index += 1;
  }
}

function translateCopiedFormula(value: string, columnDelta: number) {
  return value.replace(/(\$?)([A-Z]{1,3})(\$?\d+)/g, (_match, absolute: string, columnText: string, row: string) => {
    if (absolute) return `${absolute}${columnText}${row}`;
    const column = XLSX.utils.decode_col(columnText) + columnDelta;
    return `${XLSX.utils.encode_col(column)}${row}`;
  });
}

function shiftWorksheetColumns(xml: string, insertionColumn: number, width: number) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  for (const cell of Array.from(document.getElementsByTagNameNS(MAIN_NS, "c"))) {
    const address = cell.getAttribute("r");
    const match = address?.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;
    const column = XLSX.utils.decode_col(match[1]) + 1;
    if (column >= insertionColumn) {
      cell.setAttribute("r", `${XLSX.utils.encode_col(column + width - 1)}${match[2]}`);
    }
  }

  for (const formula of Array.from(document.getElementsByTagNameNS(MAIN_NS, "f"))) {
    if (formula.textContent) {
      const adjusted = adjustColumnReferences(formula.textContent, insertionColumn, width);
      while (formula.firstChild) formula.removeChild(formula.firstChild);
      formula.appendChild(document.createTextNode(adjusted));
    }
    const sharedRange = formula.getAttribute("ref");
    if (sharedRange) formula.setAttribute("ref", adjustColumnReferences(sharedRange, insertionColumn, width));
  }

  for (const element of Array.from(document.getElementsByTagName("*"))) {
    for (const attribute of ["ref", "sqref"]) {
      if (element.localName === "f" && attribute === "ref") continue;
      const value = element.getAttribute(attribute);
      if (value) {
        element.setAttribute(
          attribute,
          adjustColumnReferences(value, insertionColumn, width, element.localName !== "mergeCell"),
        );
      }
    }
  }

  rewriteColumnDefinitions(
    document,
    (column) => column >= insertionColumn ? column + width : column,
  );
  return new XMLSerializer().serializeToString(document);
}

function deleteWorksheetColumns(xml: string, deletionColumn: number, width: number) {
  const deletionEnd = deletionColumn + width - 1;
  const document = new DOMParser().parseFromString(xml, "application/xml");

  for (const cell of Array.from(document.getElementsByTagNameNS(MAIN_NS, "c"))) {
    const address = cell.getAttribute("r");
    const match = address?.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;
    const column = XLSX.utils.decode_col(match[1]) + 1;
    if (column >= deletionColumn && column <= deletionEnd) {
      cell.parentNode?.removeChild(cell);
    } else if (column > deletionEnd) {
      cell.setAttribute("r", `${XLSX.utils.encode_col(column - width - 1)}${match[2]}`);
    }
  }

  for (const row of Array.from(document.getElementsByTagNameNS(MAIN_NS, "row"))) {
    row.removeAttribute("spans");
  }

  for (const formula of Array.from(document.getElementsByTagNameNS(MAIN_NS, "f"))) {
    if (formula.textContent) {
      const adjusted = adjustDeletedColumnReferences(formula.textContent, deletionColumn, width);
      while (formula.firstChild) formula.removeChild(formula.firstChild);
      formula.appendChild(document.createTextNode(adjusted));
    }
    const sharedRange = formula.getAttribute("ref");
    if (sharedRange) {
      formula.setAttribute("ref", adjustDeletedColumnReferences(sharedRange, deletionColumn, width));
    }
  }

  for (const element of Array.from(document.getElementsByTagName("*"))) {
    for (const attribute of ["ref", "sqref"]) {
      if (element.localName === "f" && attribute === "ref") continue;
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const adjusted = adjustDeletedColumnReferences(value, deletionColumn, width);
      if (adjusted.includes("#REF!") && element.localName === "mergeCell") {
        element.parentNode?.removeChild(element);
      } else {
        element.setAttribute(attribute, adjusted);
      }
    }
  }

  rewriteColumnDefinitions(document, (column) => {
    if (column >= deletionColumn && column <= deletionEnd) return undefined;
    return column > deletionEnd ? column - width : column;
  });
  return new XMLSerializer().serializeToString(document);
}

function normalizeWorksheetMetadata(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const mergeCells = document.getElementsByTagNameNS(MAIN_NS, "mergeCells")[0];
  if (mergeCells) {
    mergeCells.setAttribute(
      "count",
      String(mergeCells.getElementsByTagNameNS(MAIN_NS, "mergeCell").length),
    );
  }

  for (const row of Array.from(document.getElementsByTagNameNS(MAIN_NS, "row"))) {
    const cells = Array.from(row.childNodes)
      .filter((node): node is XmlElement => node.nodeType === 1 && node.localName === "c")
      .sort((first, second) => {
        const firstAddress = first.getAttribute("r") ?? "A1";
        const secondAddress = second.getAttribute("r") ?? "A1";
        return columnNumber(firstAddress) - columnNumber(secondAddress);
      });
    const extension = Array.from(row.childNodes)
      .find((node) => node.nodeType === 1 && node.localName === "extLst");
    for (const cell of cells) row.removeChild(cell);
    for (const cell of cells) {
      if (extension) row.insertBefore(cell, extension);
      else row.appendChild(cell);
    }
  }
  return new XMLSerializer().serializeToString(document);
}

function replaceCellAddress(cellXml: string, address: string) {
  return cellXml.replace(/\br="[A-Z]+\d+"/, `r="${address}"`);
}

function cloneCellForAwbBlock(cellXml: string, address: string, columnDelta: number, keepValue: boolean) {
  let cloned = replaceCellAddress(cellXml, address);
  const formula = cloned.match(/<f([^>]*)>([\s\S]*?)<\/f>/);
  if (formula) {
    cloned = cloned.replace(formula[0], `<f${formula[1]}>${translateCopiedFormula(formula[2], columnDelta)}</f>`);
    return cloned.replace(/<v>[\s\S]*?<\/v>/, "<v>0</v>");
  }
  return keepValue ? cloned : emptyStyledCell(cloned, address);
}

function insertRawCell(rowXml: string, address: string, cellXml: string) {
  const cells = [...rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
  const targetColumn = columnNumber(address);
  const next = cells.find((match) => columnNumber(match[1]) > targetColumn);
  return next
    ? rowXml.replace(next[0], `${cellXml}${next[0]}`)
    : rowXml.replace(/<\/row>$/, `${cellXml}</row>`);
}

function upsertFormulaCell(rowXml: string, address: string, formula: string) {
  const existing = getCellXml(rowXml, address);
  const style = styleAttribute(existing);
  const cell = `<c r="${address}"${style ? ` s="${style}"` : ""}><f>${escapeXml(formula)}</f><v>0</v></c>`;
  return existing ? rowXml.replace(existing, cell) : insertRawCell(rowXml, address, cell);
}

function translateCopiedRowFormula(value: string, rowDelta: number) {
  return value.replace(
    /(\$?[A-Z]{1,3})(\$?)(\d+)/g,
    (_match, column: string, absoluteRow: string, rowText: string) => {
      if (absoluteRow) return `${column}${absoluteRow}${rowText}`;
      return `${column}${Number(rowText) + rowDelta}`;
    },
  );
}

function ensureTotalFormula(
  xml: string,
  targetRow: number,
  dataStartRow: number,
  totalColumn: number,
) {
  const column = XLSX.utils.encode_col(totalColumn - 1);
  const targetAddress = `${column}${targetRow}`;
  const targetRowXml = getRowXml(xml, targetRow);
  const targetCell = getCellXml(targetRowXml, targetAddress);
  if (/<f\b/.test(targetCell)) return xml;

  for (let sourceRow = targetRow - 1; sourceRow >= dataStartRow; sourceRow -= 1) {
    const sourceCell = getCellXml(getRowXml(xml, sourceRow), `${column}${sourceRow}`);
    const formula = sourceCell.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
    if (!formula) continue;
    const nextRowXml = upsertFormulaCell(
      targetRowXml,
      targetAddress,
      translateCopiedRowFormula(formula, targetRow - sourceRow),
    );
    return xml.replace(targetRowXml, nextRowXml);
  }
  return xml;
}

function insertAwbBlock(
  xml: string,
  insertion: AwbBlockInsertion,
  headerRow: number,
  data: PackingListData,
  styles: {
    awb: string;
    product: string;
    sizeHighlighted: string;
    sizePlain: string;
  },
) {
  const original = xml;
  const sourceStart = insertion.sourceColumn;
  const sourceEnd = sourceStart + insertion.width - 1;
  const targetStart = insertion.insertionColumn;
  const columnDelta = targetStart - sourceStart;
  const sourceMerges = [...original.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"[^>]*\/>/g)]
    .filter((match) => {
      const start = XLSX.utils.decode_col(match[1]) + 1;
      const end = XLSX.utils.decode_col(match[3]) + 1;
      const startRow = Number(match[2]);
      const isReplacedHeaderMerge = startRow === headerRow - 2 || startRow === headerRow - 1;
      return start >= sourceStart && end <= sourceEnd && !isReplacedHeaderMerge;
    })
    .map((match) => {
      const start = XLSX.utils.decode_col(match[1]) + 1 + columnDelta;
      const end = XLSX.utils.decode_col(match[3]) + 1 + columnDelta;
      return `<mergeCell ref="${XLSX.utils.encode_col(start - 1)}${match[2]}:${XLSX.utils.encode_col(end - 1)}${match[4]}"/>`;
    });

  let shifted = shiftWorksheetColumns(xml, targetStart, insertion.width);
  const rows = [...original.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
  for (const rowMatch of rows) {
    const row = Number(rowMatch[1]);
    let targetRowXml = getRowXml(shifted, row);
    if (!targetRowXml) continue;
    const sourceRowXml = rowMatch[0];
    for (let offset = 0; offset < insertion.width; offset += 1) {
      const sourceAddress = `${XLSX.utils.encode_col(sourceStart + offset - 1)}${row}`;
      const targetAddress = `${XLSX.utils.encode_col(targetStart + offset - 1)}${row}`;
      const sourceCell = getCellXml(sourceRowXml, sourceAddress);
      if (!sourceCell) continue;
      const keepValue = row === headerRow;
      const cloned = cloneCellForAwbBlock(sourceCell, targetAddress, columnDelta, keepValue);
      targetRowXml = insertRawCell(targetRowXml, targetAddress, cloned);
    }
    shifted = shifted.replace(getRowXml(shifted, row), targetRowXml);
  }

  const awbHeaderRow = headerRow - 2;
  const productHeaderRow = headerRow - 1;
  const targetEnd = targetStart + insertion.width - 1;
  const newMerges = [
    ...sourceMerges,
    `<mergeCell ref="${XLSX.utils.encode_col(targetStart - 1)}${awbHeaderRow}:${XLSX.utils.encode_col(targetEnd - 1)}${awbHeaderRow}"/>`,
    `<mergeCell ref="${XLSX.utils.encode_col(targetStart - 1)}${productHeaderRow}:${XLSX.utils.encode_col(targetEnd - 1)}${productHeaderRow}"/>`,
  ];
  shifted = shifted.replace(/<\/mergeCells>/, `${newMerges.join("")}</mergeCells>`);

  const awbAddress = `${XLSX.utils.encode_col(targetStart - 1)}${awbHeaderRow}`;
  const productAddress = `${XLSX.utils.encode_col(targetStart - 1)}${productHeaderRow}`;
  for (const [row, address, value] of [
    [awbHeaderRow, awbAddress, normalizeAwb(data.awbNo)],
    [productHeaderRow, productAddress, null],
  ] as const) {
    const rowXml = getRowXml(shifted, row);
    const style = row === awbHeaderRow ? styles.awb : styles.product;
    const existing = getCellXml(rowXml, address);
    let nextRowXml = value === null
      ? existing
        ? rowXml.replace(existing, `<c r="${address}" s="${style}"/>`)
        : insertRawCell(rowXml, address, `<c r="${address}" s="${style}"/>`)
      : upsertCell(rowXml, address, value, style);
    for (let offset = 0; offset < insertion.width; offset += 1) {
      const cellAddress = `${XLSX.utils.encode_col(targetStart + offset - 1)}${row}`;
      if (!getCellXml(nextRowXml, cellAddress)) {
        nextRowXml = insertRawCell(nextRowXml, cellAddress, `<c r="${cellAddress}" s="${style}"/>`);
      }
      nextRowXml = setCellStyle(nextRowXml, cellAddress, style);
    }
    shifted = shifted.replace(rowXml, nextRowXml);
  }

  for (const [offset, size] of ["10과", "12과", "14과", "16과", "18과"].entries()) {
    const address = `${XLSX.utils.encode_col(targetStart + offset - 1)}${headerRow}`;
    const rowXml = getRowXml(shifted, headerRow);
    const style = offset < 2 ? styles.sizeHighlighted : styles.sizePlain;
    shifted = shifted.replace(
      rowXml,
      setCellStyle(upsertCell(rowXml, address, size, style), address, style),
    );
  }

  for (let offset = 0; offset < insertion.width; offset += 1) {
    const column = XLSX.utils.encode_col(targetStart + offset - 1);
    for (const [row, formula] of [
      [insertion.summaryRow, `SUM(${column}${insertion.dataStartRow}:${column}${insertion.summaryRow - 1})`],
      [insertion.summaryRow + 1, `SUM(${column}${insertion.outboundStartRow}:${column}${insertion.outboundEndRow})`],
      [insertion.summaryRow + 2, `${column}${insertion.summaryRow}-${column}${insertion.summaryRow + 1}`],
    ] as const) {
      const rowXml = getRowXml(shifted, row);
      shifted = shifted.replace(rowXml, upsertFormulaCell(rowXml, `${column}${row}`, formula));
    }
  }
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

  const cells = [...rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
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
  const styledCells = [...sourceRowXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
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
  const awb = normalizeAwb(data.awbNo);
  const date = excelSerialFromDate(data.date);
  let result = upsertCell(rowXml, `C${row}`, date, columnStyles.get("C"));
  result = upsertCell(result, `D${row}`, `${awb}(${totalQuantity}ct)`, columnStyles.get("D"));
  for (const size of ["10", "12", "14", "16", "18"] as const) {
    const column = layout.sizeColumns[size];
    if (column) {
      const columnName = XLSX.utils.encode_col(column - 1);
      result = upsertCell(
        result,
        `${columnName}${row}`,
        aggregated.quantities[size],
        layout.numericStyle ?? columnStyles.get(columnName),
      );
      if (layout.numericStyle) {
        result = setCellStyle(result, `${columnName}${row}`, layout.numericStyle);
      }
    }
  }
  const totalColumnName = XLSX.utils.encode_col(layout.totalColumn - 1);
  const totalAddress = `${totalColumnName}${row}`;
  if (!/<f\b/.test(getCellXml(result, totalAddress))) {
    result = upsertCell(result, totalAddress, totalQuantity, columnStyles.get(totalColumnName));
  }
  return result;
}

function appendSolidFill(document: XmlDocument, fills: XmlElement, color: string) {
  const fill = document.createElementNS(MAIN_NS, "fill");
  const pattern = document.createElementNS(MAIN_NS, "patternFill");
  pattern.setAttribute("patternType", "solid");
  const foreground = document.createElementNS(MAIN_NS, "fgColor");
  foreground.setAttribute("rgb", color);
  const background = document.createElementNS(MAIN_NS, "bgColor");
  background.setAttribute("indexed", "64");
  pattern.appendChild(foreground);
  pattern.appendChild(background);
  fill.appendChild(pattern);
  fills.appendChild(fill);
  fills.setAttribute("count", String(fills.getElementsByTagNameNS(MAIN_NS, "fill").length));
  return fills.getElementsByTagNameNS(MAIN_NS, "fill").length - 1;
}

function appendCellStyle(
  document: ReturnType<DOMParser["parseFromString"]>,
  cellXfs: XmlElement,
  baseStyle: number,
  fillId?: number,
  numberFormatId?: number,
) {
  const xfs = cellXfs.getElementsByTagNameNS(MAIN_NS, "xf");
  const base = xfs[Math.min(baseStyle, xfs.length - 1)];
  const xf = base?.cloneNode(true) as XmlElement | undefined
    ?? document.createElementNS(MAIN_NS, "xf");
  if (numberFormatId !== undefined) {
    xf.setAttribute("numFmtId", String(numberFormatId));
    xf.setAttribute("applyNumberFormat", "1");
  }
  if (fillId !== undefined) {
    xf.setAttribute("fillId", String(fillId));
    xf.setAttribute("applyFill", "1");
  }
  let alignment = xf.getElementsByTagNameNS(MAIN_NS, "alignment")[0];
  if (!alignment) {
    alignment = document.createElementNS(MAIN_NS, "alignment");
    xf.appendChild(alignment);
  }
  alignment.setAttribute("horizontal", "center");
  alignment.setAttribute("vertical", "center");
  cellXfs.appendChild(xf);
  cellXfs.setAttribute("count", String(cellXfs.getElementsByTagNameNS(MAIN_NS, "xf").length));
  return cellXfs.getElementsByTagNameNS(MAIN_NS, "xf").length - 1;
}

function createAwbStyles(
  stylesXml: string,
  baseStyles: { awb: number; product: number; size: number; numeric: number },
) {
  const document = new DOMParser().parseFromString(stylesXml, "application/xml");
  const fills = document.getElementsByTagNameNS(MAIN_NS, "fills")[0];
  const cellXfs = document.getElementsByTagNameNS(MAIN_NS, "cellXfs")[0];
  if (!fills || !cellXfs) throw new Error("Excel 스타일 구조를 읽을 수 없습니다.");
  const awbFill = appendSolidFill(document, fills, "FFFFFF00");
  const whiteFill = appendSolidFill(document, fills, "FFFFFFFF");
  const sizeFill = appendSolidFill(document, fills, "FFFFFF00");
  const baseXfs = cellXfs.getElementsByTagNameNS(MAIN_NS, "xf");
  const sizeNumberFormat = Number(baseXfs[baseStyles.size]?.getAttribute("numFmtId") ?? 0);
  const styles = {
    awb: String(appendCellStyle(document, cellXfs, baseStyles.awb, awbFill)),
    product: String(appendCellStyle(document, cellXfs, baseStyles.product, whiteFill)),
    sizeHighlighted: String(
      appendCellStyle(document, cellXfs, baseStyles.size, sizeFill, sizeNumberFormat),
    ),
    sizePlain: String(
      appendCellStyle(document, cellXfs, baseStyles.size, whiteFill, sizeNumberFormat),
    ),
    numeric: String(appendCellStyle(document, cellXfs, baseStyles.numeric, undefined, 0)),
  };
  return { xml: new XMLSerializer().serializeToString(document), styles };
}

function getAddedColumnValues(layout: DynamicLayout, data: PackingListData) {
  const aggregated = aggregateData(data);
  const quantitySum = Object.values(aggregated.quantities).reduce((sum, value) => sum + value, 0);
  const additions = new Map<string, number>();

  for (const size of ["10", "12", "14", "16", "18"] as const) {
    const column = layout.sizeColumns[size];
    const value = aggregated.quantities[size];
    if (column && value) additions.set(XLSX.utils.encode_col(column - 1), value);
  }

  const totalQuantity = aggregated.totalQuantity || quantitySum;
  if (totalQuantity) {
    additions.set(XLSX.utils.encode_col(layout.totalColumn - 1), totalQuantity);
  }
  return additions;
}

function addToCachedCellValue(
  document: ReturnType<DOMParser["parseFromString"]>,
  row: number,
  column: string,
  delta: number,
  requireFormula = false,
) {
  const address = `${column}${row}`;
  const cells = Array.from(document.getElementsByTagNameNS(MAIN_NS, "c"));
  const cell = cells.find((candidate) => candidate.getAttribute("r") === address);
  if (!cell || requireFormula && !cell.getElementsByTagNameNS(MAIN_NS, "f").length) return;

  let valueElement = cell.getElementsByTagNameNS(MAIN_NS, "v")[0];
  if (!valueElement) {
    valueElement = document.createElementNS(MAIN_NS, "v");
    cell.appendChild(valueElement);
  }
  const currentValue = Number(valueElement.textContent || 0);
  const nextValue = (Number.isFinite(currentValue) ? currentValue : 0) + delta;
  while (valueElement.firstChild) valueElement.removeChild(valueElement.firstChild);
  valueElement.appendChild(document.createTextNode(String(nextValue)));
}

function updateCachedTotals(
  xml: string,
  summaryRow: number,
  layout: DynamicLayout,
  data: PackingListData,
) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const additions = getAddedColumnValues(layout, data);

  for (const [column, delta] of additions) {
    // 입고 합계 행과 그 아래 잔량 행의 저장된 계산값도 함께 갱신한다.
    // 브라우저/미리보기처럼 수식을 즉시 재계산하지 않는 환경에서도 올바른 값이 보인다.
    addToCachedCellValue(document, summaryRow, column, delta);
    addToCachedCellValue(document, summaryRow + 2, column, delta, true);
  }

  return new XMLSerializer().serializeToString(document);
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

function removeCalcChain(
  zip: JSZip,
  relationshipsXml: string,
  contentTypesXml: string,
) {
  zip.remove("xl/calcChain.xml");
  const nextRelationships = relationshipsXml.replace(
    /<Relationship\b[^>]*\bType="[^"]*\/calcChain"[^>]*\/>/g,
    "",
  );
  const nextContentTypes = contentTypesXml.replace(
    /<Override\b[^>]*\bPartName="\/xl\/calcChain\.xml"[^>]*\/>/g,
    "",
  );
  return { relationshipsXml: nextRelationships, contentTypesXml: nextContentTypes };
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

export async function generateManagedWorkbookXml(
  file: File,
  data: PackingListData,
  options: { finalizeBundledTemplate?: boolean } = {},
) {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellFormula: true,
    cellStyles: true,
    sheetStubs: true,
  });
  const analyzed = analyzeLayout(workbook, data.awbNo);
  const layout: DynamicLayout = analyzed.layout;
  const { targetRow, insertRow, awbBlockInsertion } = analyzed;
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relationshipsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");
  if (!workbookXml || !relationshipsXml || !contentTypesXml) {
    throw new Error("Excel 통합문서 구조를 읽을 수 없습니다.");
  }
  const sheetPath = resolveFirstSheetPath(workbookXml, relationshipsXml);
  let sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error("출고요청서 시트 XML을 읽을 수 없습니다.");

  if (awbBlockInsertion) {
    const stylesXml = await zip.file("xl/styles.xml")?.async("string");
    if (!stylesXml) throw new Error("Excel 스타일 파일을 읽을 수 없습니다.");
    const sourceColumnName = XLSX.utils.encode_col(awbBlockInsertion.sourceColumn - 1);
    const baseStyles = {
      awb: Number(styleAttribute(getCellXml(getRowXml(sheetXml, layout.headerRow - 2), `${sourceColumnName}${layout.headerRow - 2}`)) ?? 0),
      product: Number(styleAttribute(getCellXml(getRowXml(sheetXml, layout.headerRow - 1), `${sourceColumnName}${layout.headerRow - 1}`)) ?? 0),
      size: Number(styleAttribute(getCellXml(getRowXml(sheetXml, layout.headerRow), `${sourceColumnName}${layout.headerRow}`)) ?? 0),
      numeric: Number(styleAttribute(getCellXml(getRowXml(sheetXml, layout.dataStartRow), `${sourceColumnName}${layout.dataStartRow}`)) ?? 0),
    };
    const created = createAwbStyles(stylesXml, baseStyles);
    zip.file("xl/styles.xml", created.xml);
    layout.numericStyle = created.styles.numeric;
    sheetXml = insertAwbBlock(sheetXml, awbBlockInsertion, layout.headerRow, data, created.styles);
  }
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

  sheetXml = ensureTotalFormula(
    sheetXml,
    targetRow,
    layout.dataStartRow,
    layout.totalColumn,
  );
  const currentRow = getRowXml(sheetXml, targetRow);
  sheetXml = sheetXml.replace(currentRow, populateRow(currentRow, targetRow, layout, data, columnStyles));
  const outputSummaryRow = layout.summaryRow + (insertRow ? 1 : 0);
  sheetXml = updateCachedTotals(sheetXml, outputSummaryRow, layout, data);
  if (options.finalizeBundledTemplate) {
    sheetXml = deleteWorksheetColumns(sheetXml, 5, 9);
    const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (sharedStringsXml) {
      sheetXml = clearRowsFromSharedString(sheetXml, sharedStringsXml, "검역로스");
    }
  }
  zip.file(sheetPath, normalizeWorksheetMetadata(sheetXml));
  zip.file("xl/workbook.xml", enableWorkbookRecalculation(workbookXml));
  const withoutCalcChain = removeCalcChain(zip, relationshipsXml, contentTypesXml);
  zip.file("xl/_rels/workbook.xml.rels", withoutCalcChain.relationshipsXml);
  zip.file("[Content_Types].xml", withoutCalcChain.contentTypesXml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
