import { useState } from "react";
import type { PackingListData } from "../types/packingList";
import { downloadBlob, generateShippingWorkbook } from "../services/excelService";

export function useExcelExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const exportExcel = async (documents: PackingListData[], managedExcel?: File | null) => {
    setError("");
    if (!documents.length) throw new Error("스캔한 패킹리스트가 없습니다.");
    for (const data of documents) {
      if (!data.awbNo.trim()) throw new Error("모든 패킹리스트의 AWB NO.가 필요합니다.");
      if (!data.date.trim()) throw new Error("모든 패킹리스트의 Date가 필요합니다.");
      if (!data.items.length) throw new Error("각 패킹리스트에 상품 정보가 한 행 이상 필요합니다.");
    }
    setIsExporting(true);
    try {
      const blob = await generateShippingWorkbook(documents, managedExcel);
      const safeAwb = documents.length === 1
        ? documents[0].awbNo.replace(/[^\d]/g, "") || "shipping"
        : `${documents.length}건`;
      const sourceName = managedExcel?.name.replace(/\.xlsx$/i, "") ?? "출고요청서";
      downloadBlob(blob, `${sourceName}_추가_${safeAwb}.xlsx`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Excel 생성에 실패했습니다.";
      setError(message);
      throw cause;
    } finally {
      setIsExporting(false);
    }
  };

  return { exportExcel, isExporting, error };
}
