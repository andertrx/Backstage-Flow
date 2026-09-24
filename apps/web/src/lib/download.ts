/** Planilha (CSV) com ";" e BOM: abre certo no Excel e no Google Planilhas em português. */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\n");
}

/** Baixa um arquivo gerado no navegador (nada é enviado a servidor nenhum). */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(name: string, rows: string[][]) {
  downloadBlob(name, new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
}
