import { OPS_SAVED_VIEW_MAX, type OpsSavedViewPage, type OpsViewFilters, opsCleanViewFilters, opsViewNameError } from "@backstage/shared";
import { Bookmark, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useDeleteView, useSaveView, useSavedViews } from "./dashboardApi.ts";

const stable = (f: OpsViewFilters) => JSON.stringify(Object.keys(f).sort().map((k) => [k, f[k]]));
const sameFilters = (a: OpsViewFilters, b: OpsViewFilters) => stable(a) === stable(b);

/**
 * Visões salvas (36.7): cada pessoa guarda os filtros que usa sempre, com um
 * nome, e volta a eles com um clique. Só a própria pessoa vê as suas.
 * "keys": os filtros que aquela tela entende (o resto é ignorado).
 */
export function SavedViews({ page, keys, current, onApply }: {
  page: OpsSavedViewPage;
  keys: readonly string[];
  current: Record<string, unknown>;
  onApply: (filters: OpsViewFilters) => void;
}) {
  const views = useSavedViews(page);
  const save = useSaveView();
  const remove = useDeleteView();
  const [selected, setSelected] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = views.data ?? [];
  const filters = opsCleanViewFilters(current, keys);
  // A visão só fica marcada enquanto os filtros na tela forem os dela.
  const picked = list.find((v) => v.id === selected);
  const chosen = picked && sameFilters(opsCleanViewFilters(picked.filters, keys), filters) ? picked : undefined;
  const empty = Object.keys(filters).length === 0;

  function choose(id: string) {
    setSelected(id);
    setError(null);
    const v = list.find((x) => x.id === id);
    if (v) onApply(opsCleanViewFilters(v.filters, keys));
  }

  async function confirmSave() {
    const problem = opsViewNameError(name);
    if (problem) { setError(problem); return; }
    setError(null);
    try {
      const id = await save.mutateAsync({ page, name, filters });
      setSelected(id);
      setNaming(false);
      setName("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!chosen) return;
    setError(null);
    try {
      await remove.mutateAsync(chosen.id);
      setSelected("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ops-saved-views">
      <Bookmark className="size-4 text-blue-500" aria-hidden />
      <Select aria-label="Visões salvas" className="w-auto" value={chosen?.id ?? ""} onChange={(e) => choose(e.target.value)} disabled={views.isLoading}>
        <option value="">{list.length === 0 ? "Nenhuma visão salva" : "Visões salvas"}</option>
        {list.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </Select>
      {chosen && (
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={confirmDelete} loading={remove.isPending} aria-label={`Apagar a visão ${chosen.name}`}>
          <Trash2 className="size-3.5" aria-hidden /> Apagar
        </Button>
      )}
      {naming ? (
        <>
          <Input aria-label="Nome da visão" placeholder="Ex.: Atrasadas do Design" className="w-56" maxLength={60} autoFocus value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmSave(); if (e.key === "Escape") setNaming(false); }} />
          <Button className="px-3 py-1.5 text-xs" onClick={confirmSave} loading={save.isPending}>Salvar</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setNaming(false); setError(null); }}>Cancelar</Button>
        </>
      ) : (
        <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={empty || (list.length >= OPS_SAVED_VIEW_MAX && !chosen)}
          title={empty ? "Escolha algum filtro antes de salvar." : list.length >= OPS_SAVED_VIEW_MAX && !chosen ? `No máximo ${OPS_SAVED_VIEW_MAX} visões por tela.` : undefined}
          onClick={() => { setNaming(true); setName(chosen?.name ?? ""); }}>
          Salvar filtros como visão
        </Button>
      )}
      {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
    </div>
  );
}
