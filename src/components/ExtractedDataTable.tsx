import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { createEmptyItem } from "../config/packingListFields";
import type { PackingListData } from "../types/packingList";

interface Props { form: UseFormReturn<PackingListData>; }

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const excelSizes = ["10", "12", "14", "16", "18"] as const;

export function ExtractedDataTable({ form }: Props) {
  const { register, control, getValues, resetField } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const [activeItem, setActiveItem] = useState(0);

  useEffect(() => {
    if (!fields.length) {
      append(createEmptyItem());
      setActiveItem(0);
    } else if (activeItem >= fields.length) {
      setActiveItem(fields.length - 1);
    }
  }, [activeItem, append, fields.length]);

  const addItem = () => {
    append(createEmptyItem());
    setActiveItem(fields.length);
  };

  const copyItem = () => {
    const row = structuredClone(getValues(`items.${activeItem}`));
    row.id = crypto.randomUUID();
    append(row);
    setActiveItem(fields.length);
  };

  const removeItem = () => {
    if (fields.length <= 1) {
      resetField(`items.${activeItem}`, { defaultValue: createEmptyItem() });
      return;
    }
    remove(activeItem);
    setActiveItem(Math.max(0, activeItem - 1));
  };

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-card">
      <div className="border-b bg-slate-50 px-4 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">상품별 출고 정보</h3>
            <p className="text-xs text-slate-500">상품 탭을 선택해 Excel에 반영될 값만 검수하세요.</p>
          </div>
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus size={16} /> 상품 추가
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {fields.map((field, index) => {
            const item = getValues(`items.${index}`);
            const label = item?.variety || item?.productName || `상품 ${index + 1}`;
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => setActiveItem(index)}
                className={`whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold ${
                  activeItem === index
                    ? "border-slate-300 bg-white text-blue-700"
                    : "border-transparent bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {fields[activeItem] && (
        <div className="space-y-5 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              Product Name
              <input className={inputClass} {...register(`items.${activeItem}.productName`)} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Variety
              <input className={inputClass} {...register(`items.${activeItem}.variety`)} />
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
                    {...register(`items.${activeItem}.quantities.${size}`, { setValueAs: (value) => value === "" ? "" : Number(value) })}
                  />
                </label>
              ))}
              <label className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-700">
                Total Qty
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  {...register(`items.${activeItem}.totalQuantity`, { setValueAs: (value) => value === "" ? "" : Number(value) })}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <button type="button" onClick={copyItem} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <Copy size={16} /> 상품 복사
            </button>
            <button type="button" onClick={() => resetField(`items.${activeItem}`, { defaultValue: createEmptyItem() })} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <RotateCcw size={16} /> 상품 초기화
            </button>
            <button type="button" onClick={removeItem} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              <Trash2 size={16} /> 상품 삭제
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
