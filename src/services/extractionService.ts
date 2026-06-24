import { createEmptyItem, createEmptyPackingList } from "../config/packingListFields";
import { SIZE_KEYS, type PackingListData, type SizeKey } from "../types/packingList";

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
};

const numberFrom = (value: string) => {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : "";
};

const lineValue = (text: string, label: RegExp) => {
  const line = text.split("\n").find((candidate) => label.test(candidate));
  if (!line) return "";
  return line.replace(label, "").replace(/^[\s:.-]+/, "").trim();
};

const structuredValue = (text: string, key: string) => {
  const prefix = `${key}:`;
  const line = text.split(/\r?\n/).find((candidate) =>
    candidate.trimStart().toUpperCase().startsWith(prefix),
  );
  return line ? line.trimStart().slice(prefix.length).trim() : "";
};

const hasStructuredField = (text: string, key: string) =>
  text.split(/\r?\n/).some((candidate) =>
    candidate.trimStart().toUpperCase().startsWith(`${key}:`),
  );

const cleanCountry = (value: string) => {
  const country = value
    .replace(/[^A-Za-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (/\bKOREA\b/.test(country)) return "KOREA";
  return country.split(" ").slice(0, 3).join(" ");
};

export function extractPackingList(rawText: string): PackingListData {
  const text = rawText.replace(/\r/g, "").replace(/[|]/g, "I");
  const data = createEmptyPackingList();
  const item = createEmptyItem();

  data.date = firstMatch(text, [/Date[ \t]*[:.]?[ \t]*([0-9]{1,2}[ \t]+[A-Za-z]{3}\.?,?[ \t]*[0-9]{4})/i]);
  data.invoiceNo = firstMatch(text, [/Invoice[ \t]*(?:Ref\.?[ \t]*)?No\.?[ \t]*[:.]?[ \t]*([A-Z0-9-]+)/i]);
  data.flight = firstMatch(text, [/Flight(?:[ \t]*No\.?)?[ \t]*[:.]?[ \t]*([A-Z0-9/-]+)/i]);
  data.destination = cleanCountry(
    lineValue(text, /^Destination\b/i) ||
    lineValue(text, /^Ship\s*To\b/i),
  );
  data.shipBy = firstMatch(text, [/Ship[ \t]*By[ \t]*[:.]?[ \t]*([A-Za-z]+)/i]) || "AIR";
  data.awbNo = firstMatch(text, [/AWB\s*NO\.?\s*[:.]?\s*([0-9 -]{11,16})/i, /\b(618\s*-\s*\d{4}\s+\d{4})\b/]);

  const structuredCustomer = cleanCountry(structuredValue(text, "CUSTOMER"));
  item.customer = structuredCustomer || cleanCountry(data.destination);
  item.productName = firstMatch(text, [/\b(Fresh\s+Mango)\b/i]) || "Fresh Mango";
  const varietyLine = firstMatch(text, [/(Mahachanok(?:\s+Grade\s+[A-Z])?)/i]);
  item.variety = varietyLine.replace(/\s+Grade\s+[A-Z].*$/i, "").trim();
  item.grade = firstMatch(varietyLine, [/(Grade\s+[A-Z])/i]);

  const sizeKg = structuredValue(text, "SIZE_KG") || firstMatch(text, [
    /Size[ \t]*\/?[ \t]*KG[ \t]*[:.]?[ \t]*(\d+(?:\.\d+)?)/i,
    /KG[ \t]*:[ \t]*CTNS?\)?[ \t]*(\d+(?:\.\d+)?)/i,
  ]);
  item.sizeKg = numberFrom(sizeKg);

  for (const size of SIZE_KEYS) {
    const structured = structuredValue(text, `SIZE_${size}`);
    const linePattern = new RegExp(`(?:-|\\b)\\s*size\\s*${size}\\s+([0-9,]+)`, "i");
    const tablePattern = new RegExp(`\\b${size}\\s+([0-9,]+)(?=\\s+(?:${SIZE_KEYS.join("|")}|Total|$))`, "i");
    const matched = structured || firstMatch(text, [linePattern, tablePattern]);
    item.quantities[size as SizeKey] = numberFrom(matched);
  }

  item.totalQuantity = numberFrom(structuredValue(text, "TOTAL_QUANTITY") || firstMatch(text, [
    /TOTAL\s+QUANTITY\s*\(?(?:CARTONS|BUNDLES)?\)?\s*([0-9,.]+)/i,
    /Total\s+Quantity\s*[:.]?\s*([0-9,.]+)/i,
    /\bQuantity\s+Net\s+Weight[\s\S]{0,100}?\b([0-9]{3,})\b/i,
  ]));
  item.netWeight = numberFrom(structuredValue(text, "NET_WEIGHT") || firstMatch(text, [/TOTAL\s+NET\s+WEIGHT\s*\(KGS?\)\s*([0-9,.]+)/i, /Net\s+Weight\s*\/?kg[\s\S]{0,60}?([0-9,.]+)/i]));
  item.grossWeight = numberFrom(structuredValue(text, "GROSS_WEIGHT") || firstMatch(text, [/TOTAL\s+GROSS\s+WEIGHT\s*\(KGS?\)\s*([0-9,.]+)/i, /Gross\s+Weight\s*\/?kg[\s\S]{0,60}?([0-9,.]+)/i]));
  item.remarks = hasStructuredField(text, "REMARKS")
    ? structuredValue(text, "REMARKS")
    : firstMatch(text, [/Remarks[ \t]*[:.]?[ \t]*(.+)/i]);

  const structuredProduct = structuredValue(text, "PRODUCT");
  if (structuredProduct) {
    if (/Fresh\s*Mango/i.test(structuredProduct)) item.productName = "Fresh Mango";
    const structuredVariety = firstMatch(structuredProduct, [/(Mahachanok)/i]);
    if (structuredVariety) item.variety = "Mahachanok";
    const structuredGrade = firstMatch(structuredProduct, [/(Grade\s*[A-Z])/i]);
    if (structuredGrade) item.grade = structuredGrade.replace(/\s+/g, " ");
  }

  const quantitySum = Object.values(item.quantities).reduce<number>((sum, value) => sum + (value === "" ? 0 : value), 0);
  if (item.totalQuantity === "" && quantitySum > 0) item.totalQuantity = quantitySum;
  if (item.sizeKg !== "" && item.netWeight === "" && item.totalQuantity !== "") {
    item.netWeight = item.sizeKg * item.totalQuantity;
  }
  data.items = [item];
  return data;
}
