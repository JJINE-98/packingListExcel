import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { createEmptyItem } from "../config/packingListFields";
import type { PackingListData } from "../types/packingList";

interface Props { form: UseFormReturn<PackingListData>; }

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const excelSizes = ["10", "12", "14", "16", "18"] as const;

export function ExtractedDataTable({ form }: Props) {
  const { register, getValues, setValue } = form;

  useEffect(() => {
    const items = getValues("items");
    if (!items?.length) {
      setValue("items", [createEmptyItem()]);
    } else if (items.length > 1) {
      setValue("items", [items[0]]);
    }
  }, [getValues, setValue]);

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-card">
      <div className="border-b bg-slate-50 px-4 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">상품 출고 정보</h3>
          <p className="text-xs text-slate-500">Excel에 반영될 단일 상품의 정보를 확인하고 수정하세요.</p>
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
          <div className="mb-2 text-xs font-semibold text-slate-600">사이즈별 수량</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {excelSizes.map((size) => (
              <label key={size} className="rounded-xl border bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                Size {size}
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  {...register(`items.0.quantities.${size}`, { setValueAs: (value) => value === "" ? "" : Number(value) })}
                />
              </label>
            ))}
            <label className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-700">
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
