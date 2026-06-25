import type { PackingListData, PackingListItem } from "../types/packingList";

export const createEmptyItem = (): PackingListItem => ({
  id: crypto.randomUUID(),
  customer: "",
  productName: "",
  variety: "",
  grade: "",
  sizeKg: "",
  quantities: { "8": "", "10": "", "12": "", "14": "", "16": "", "18": "", "20": "", "22": "" },
  totalQuantity: "",
  netWeight: "",
  grossWeight: "",
  remarks: "",
});

export const createEmptyPackingList = (): PackingListData => ({
  date: "",
  invoiceNo: "",
  flight: "",
  destination: "",
  shipBy: "",
  awbNo: "",
  items: [createEmptyItem()],
});

export const SAMPLE_DATA: PackingListData = {
  date: "2026-06-06",
  invoiceNo: "9B-060626-SQRXKR-1",
  flight: "SQ705-SQ606/07-06-2026",
  destination: "KOREA",
  shipBy: "AIR",
  awbNo: "618-5548 6071",
  items: [{
    id: crypto.randomUUID(),
    customer: "KOREA",
    productName: "Fresh Mango",
    variety: "Mahachanok",
    grade: "Grade C",
    sizeKg: 5,
    quantities: { "8": "", "10": 7, "12": 262, "14": 128, "16": 30, "18": 73, "20": "", "22": "" },
    totalQuantity: 500,
    netWeight: 2500,
    grossWeight: 2750,
    remarks: "",
  }],
};
