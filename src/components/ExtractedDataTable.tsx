import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { createEmptyItem } from "../config/packingListFields";
import type { PackingListData } from "../types/packingList";

interface Props { form: UseFormReturn<PackingListData>; }

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tabular-nums outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const excelSizes = ["10", "12", "14", "16", "18"] as const;

export function ExtractedDataTable({ form }: Props) {
  const { register, getValues, setValue, watch } = form;
  const item = watch("items.0");
  const sizeTotal = excelSizes.reduce((sum, size) => sum + Number(item?.quantities?.[size] || 0), 0);
  const totalQty = Number(item?.totalQuantity || 0);
  const isBalanced = sizeTotal === totalQty;

  useEffect(() => {
    const items = getValues("items");
    if (!items?.length) {
      setValue("items", [createEmptyItem()]);
    } else if (items.length > 1) {
      setValue("items", [items[0]]);
    }
  }, [getValues, setValue]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">상품 출고 정보</h3>
          <p className="text-xs text-slate-500">Excel에 반영할 상품 정보와 수량 검증값을 확인하세요.</p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Product Name
            <input className={inputClass} {...register("items.0.productName")} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Variety
            <input className={inputClass} {...register("items.0.variety")} />
          </label>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-600">사이즈별 수량</div>
            <div className={`rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${
              isBalanced
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}>
              사이즈 합계 {sizeTotal} / Total Qty {totalQty || 0}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {excelSizes.map((size) => (
              <label key={size} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                Size {size}
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  {...register(`items.0.quantities.${size}`, { setValueAs: (value) => value === "" ? "" : Number(value) })}
                />
              </label>
            ))}
            <label className={`rounded-xl border p-3 text-xs font-semibold ${
              isBalanced
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-amber-300 bg-amber-50 text-amber-800"
            }`}>
              Total Qty
              <input
                type="number"
                min="0"
                className={inputClass}
                {...register("items.0.totalQuantity", { setValueAs: (value) => value === "" ? "" : Number(value) })}
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
