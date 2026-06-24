import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { createEmptyItem } from "../config/packingListFields";
import { SIZE_KEYS, type PackingListData } from "../types/packingList";

interface Props { form: UseFormReturn<PackingListData>; }

const inputClass = "w-full min-w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function ExtractedDataTable({ form }: Props) {
  const { register, control, getValues, resetField } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const copyRow = (index: number) => {
    const row = structuredClone(getValues(`items.${index}`));
    row.id = crypto.randomUUID();
    append(row);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">상품 및 사이즈별 수량</h3>
          <p className="text-xs text-slate-500">인식 오류를 직접 수정할 수 있습니다.</p>
        </div>
        <button type="button" onClick={() => append(createEmptyItem())} className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
          <Plus size={16} /> 행 추가
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1650px] border-collapse text-left">
          <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              {["Customer", "Product Name", "Variety", "Grade", "Size/KG", ...SIZE_KEYS.map((v) => `Size ${v}`), "Total Qty", "Net Weight", "Gross Weight", "Remarks", "작업"].map((label) => (
                <th key={label} className="border-b border-r px-2 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr key={field.id} className="align-top hover:bg-blue-50/40">
                <td className="border-b border-r p-1"><input className={inputClass} {...register(`items.${index}.customer`)} /></td>
                <td className="border-b border-r p-1"><input className={inputClass} {...register(`items.${index}.productName`)} /></td>
                <td className="border-b border-r p-1"><input className={inputClass} {...register(`items.${index}.variety`)} /></td>
                <td className="border-b border-r p-1"><input className={inputClass} {...register(`items.${index}.grade`)} /></td>
                <td className="border-b border-r p-1"><input type="number" className={inputClass} {...register(`items.${index}.sizeKg`, { setValueAs: (v) => v === "" ? "" : Number(v) })} /></td>
                {SIZE_KEYS.map((size) => (
                  <td key={size} className="border-b border-r p-1">
                    <input type="number" min="0" className={inputClass} {...register(`items.${index}.quantities.${size}`, { setValueAs: (v) => v === "" ? "" : Number(v) })} />
                  </td>
                ))}
                <td className="border-b border-r p-1"><input type="number" className={inputClass} {...register(`items.${index}.totalQuantity`, { setValueAs: (v) => v === "" ? "" : Number(v) })} /></td>
                <td className="border-b border-r p-1"><input type="number" className={inputClass} {...register(`items.${index}.netWeight`, { setValueAs: (v) => v === "" ? "" : Number(v) })} /></td>
                <td className="border-b border-r p-1"><input type="number" className={inputClass} {...register(`items.${index}.grossWeight`, { setValueAs: (v) => v === "" ? "" : Number(v) })} /></td>
                <td className="border-b border-r p-1"><input className={inputClass} {...register(`items.${index}.remarks`)} /></td>
                <td className="border-b p-2">
                  <div className="flex gap-1">
                    <button type="button" title="행 복사" onClick={() => copyRow(index)} className="rounded p-1.5 hover:bg-slate-200"><Copy size={16} /></button>
                    <button type="button" title="행 초기화" onClick={() => resetField(`items.${index}`, { defaultValue: createEmptyItem() })} className="rounded p-1.5 hover:bg-slate-200"><RotateCcw size={16} /></button>
                    <button type="button" title="행 삭제" onClick={() => remove(index)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
