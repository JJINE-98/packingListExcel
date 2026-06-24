import { useState } from "react";
import type { PackingListData } from "../types/packingList";
import { downloadBlob, generateShippingWorkbook } from "../services/excelService";

export function useExcelExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const exportExcel = async (data: PackingListData) => {
    setError("");
    if (!data.awbNo.trim()) throw new Error("AWB NO.는 필수값입니다.");
    if (!data.date.trim()) throw new Error("Date는 필수값입니다.");
    if (!data.items.length) throw new Error("상품 정보가 한 행 이상 필요합니다.");
    setIsExporting(true);
    try {
      const blob = await generateShippingWorkbook(data);
      const safeAwb = data.awbNo.replace(/[^\d]/g, "") || "shipping";
      downloadBlob(blob, `출고요청서_${safeAwb}.xlsx`);
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
