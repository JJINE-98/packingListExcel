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
  const number = Number(value.replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : "";
};

export function extractPackingList(rawText: string): PackingListData {
  const text = rawText.replace(/\r/g, "").replace(/[|]/g, "I");
  const data = createEmptyPackingList();
  const item = createEmptyItem();

  data.date = firstMatch(text, [/Date\s*[:.]?\s*([0-9]{1,2}\s+[A-Za-z]{3}\.?,?\s*[0-9]{4})/i]);
  data.invoiceNo = firstMatch(text, [/Invoice\s*(?:Ref\.?\s*)?No\.?\s*[:.]?\s*([A-Z0-9-]+)/i]);
  data.flight = firstMatch(text, [/Flight(?:\s*No\.?)?\s*[:.]?\s*([A-Z0-9/-]+)/i]);
  data.destination = firstMatch(text, [/Destination\s*[:.]?\s*([A-Z ]+)/i, /Ship\s*To\s*[:.]?\s*([A-Z /]+)/i]);
  data.shipBy = firstMatch(text, [/Ship\s*By\s*[:.]?\s*([A-Za-z]+)/i]) || "AIR";
  data.awbNo = firstMatch(text, [/AWB\s*NO\.?\s*[:.]?\s*([0-9 -]{11,16})/i, /\b(618\s*-\s*\d{4}\s+\d{4})\b/]);

  item.customer = data.destination.replace(/\s*\/.*$/, "").trim();
  item.productName = firstMatch(text, [/\b(Fresh\s+Mango)\b/i]) || "Fresh Mango";
  const varietyLine = firstMatch(text, [/(Mahachanok(?:\s+Grade\s+[A-Z])?)/i]);
  item.variety = varietyLine.replace(/\s+Grade\s+[A-Z].*$/i, "").trim();
  item.grade = firstMatch(varietyLine, [/(Grade\s+[A-Z])/i]);

  const sizeKg = firstMatch(text, [/Size\s*\/?\s*KG\s*[:.]?\s*(\d+(?:\.\d+)?)/i, /KG\s*:\s*CTNS?\)?\s*(\d+(?:\.\d+)?)/i]);
  item.sizeKg = numberFrom(sizeKg);

  for (const size of SIZE_KEYS) {
    const linePattern = new RegExp(`(?:-|\\b)\\s*size\\s*${size}\\s+([0-9,]+)`, "i");
    const tablePattern = new RegExp(`\\b${size}\\s+([0-9,]+)(?=\\s+(?:${SIZE_KEYS.join("|")}|Total|$))`, "i");
    const matched = firstMatch(text, [linePattern, tablePattern]);
    item.quantities[size as SizeKey] = numberFrom(matched);
  }

  item.totalQuantity = numberFrom(firstMatch(text, [
    /TOTAL\s+QUANTITY\s*\(?(?:CARTONS|BUNDLES)?\)?\s*([0-9,.]+)/i,
    /Total\s+Quantity\s*[:.]?\s*([0-9,.]+)/i,
    /\bQuantity\s+Net\s+Weight[\s\S]{0,100}?\b([0-9]{3,})\b/i,
  ]));
  item.netWeight = numberFrom(firstMatch(text, [/TOTAL\s+NET\s+WEIGHT\s*\(KGS?\)\s*([0-9,.]+)/i, /Net\s+Weight\s*\/?kg[\s\S]{0,60}?([0-9,.]+)/i]));
  item.grossWeight = numberFrom(firstMatch(text, [/TOTAL\s+GROSS\s+WEIGHT\s*\(KGS?\)\s*([0-9,.]+)/i, /Gross\s+Weight\s*\/?kg[\s\S]{0,60}?([0-9,.]+)/i]));
  item.remarks = firstMatch(text, [/Remarks\s*[:.]?\s*(.+)/i]);

  const quantitySum = Object.values(item.quantities).reduce<number>((sum, value) => sum + (value === "" ? 0 : value), 0);
  if (item.totalQuantity === "" && quantitySum > 0) item.totalQuantity = quantitySum;
  if (item.sizeKg !== "" && item.netWeight === "" && item.totalQuantity !== "") {
    item.netWeight = item.sizeKg * item.totalQuantity;
  }
  data.items = [item];
  return data;
}
