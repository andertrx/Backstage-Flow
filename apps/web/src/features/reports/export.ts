// Exportação do relatório: CSV, Excel (.xlsx) e PDF. Tudo é gerado no navegador,
// a partir das mesmas tabelas da tela.
import { strToU8, zipSync } from "fflate";
import { type Cell, EMPTY_NOTE, formatCell, type Report, type SheetName } from "./model.ts";

// ------------------------------------------------------------------ CSV

/** Número "cru" em português (sem R$ e sem ponto de milhar): 1234,56. */
function csvNumber(cell: Cell): string {
  if (cell.value === null) return "";
  if (typeof cell.value === "string") return cell.value;
  const digits = cell.format === "integer" ? 0 : 2;
  return cell.value.toFixed(digits).replace(".", ",");
}

export function reportCsvRows(report: Report): string[][] {
  const out: string[][] = [[report.title], [`Gerado em ${report.generatedAt}`], ...report.filters.map((f) => [f]), []];
  for (const t of report.tables) {
    out.push([t.title], t.columns, ...t.rows.map((r) => r.map(csvNumber)), []);
  }
  out.push(["Células vazias = informação não disponível pela API ou sem dados no período."]);
  return out;
}

// ------------------------------------------------------------------ Excel (.xlsx)

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Estilos: 0 normal · 1 negrito · 2 dinheiro · 3 inteiro · 4 decimal · 5 porcentagem · 6 "x" · 7 título · 8 variação (+/−). */
const STYLE: Record<Cell["format"], number> = { text: 0, money: 2, integer: 3, decimal: 4, percent: 5, ratio: 6, change: 8 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.##"/><numFmt numFmtId="165" formatCode="0.00&quot;x&quot;"/><numFmt numFmtId="166" formatCode="+0.00%;-0.00%;0.00%"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

type XCell = { v: string | number | null; s: number };

function sheetXml(rows: XCell[][], widths: number[]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((c, i) => {
          const ref = `${colName(i)}${r + 1}`;
          if (c.v === null || c.v === "") return c.s ? `<c r="${ref}" s="${c.s}"/>` : "";
          if (typeof c.v === "number") return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
          return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${body}</sheetData></worksheet>`;
}

/** Um arquivo .xlsx com uma aba por parte (Resumo, Campanhas, Dia a dia). */
export function reportXlsx(report: Report): Uint8Array {
  const sheets: { name: SheetName; rows: XCell[][]; widths: number[] }[] = [];
  const order: SheetName[] = ["Resumo", "Campanhas", "Dia a dia"];
  for (const name of order) {
    const tables = report.tables.filter((t) => t.sheet === name);
    if (!tables.length && name !== "Resumo") continue;
    const rows: XCell[][] = [];
    const widths: number[] = [];
    const fit = (i: number, len: number) => (widths[i] = Math.min(60, Math.max(widths[i] ?? 10, len + 2)));
    if (name === "Resumo") {
      rows.push([{ v: report.title, s: 7 }], [{ v: `Gerado em ${report.generatedAt}`, s: 0 }], ...report.filters.map((f) => [{ v: f, s: 0 }]), []);
    }
    for (const t of tables) {
      rows.push([{ v: t.title, s: 1 }]);
      rows.push(t.columns.map((c, i) => (fit(i, c.length), { v: c, s: 1 })));
      for (const r of t.rows) {
        rows.push(r.map((cell, i) => {
          if (typeof cell.value === "string") fit(i, Math.min(cell.value.length, 50));
          // Porcentagem no Excel é fração (12,5% = 0,125).
          const v = typeof cell.value === "number" && (cell.format === "percent" || cell.format === "change") ? cell.value / 100 : cell.value;
          return { v, s: typeof cell.value === "number" ? STYLE[cell.format] : 0 };
        }));
      }
      rows.push([]);
    }
    if (name === "Resumo") rows.push([{ v: "Células vazias = informação não disponível pela API ou sem dados no período.", s: 0 }]);
    sheets.push({ name, rows, widths });
  }

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows, s.widths))));
  return zipSync(files, { level: 6 });
}

// ------------------------------------------------------------------ PDF

/** PDF em A4 deitado, com cabeçalho e uma tabela por parte. Bibliotecas carregadas só na hora. */
export async function reportPdf(report: Report): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(report.title, margin, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const header = [...report.filters, `Gerado em ${report.generatedAt}`];
  header.forEach((line, i) => doc.text(line, margin, 58 + i * 12));
  let y = 58 + header.length * 12 + 8;

  const pageHeight = doc.internal.pageSize.getHeight();
  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Backstage Flow · página ${doc.getNumberOfPages()}`, margin, pageHeight - 16);
  };
  for (const t of report.tables) {
    // Título + começo da tabela sempre juntos na mesma página.
    if (y > pageHeight - 110) {
      doc.addPage();
      y = 40;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(t.title, margin, y + 10);
    const wide = t.columns.length > 10;
    autoTable(doc, {
      startY: y + 18,
      head: [t.columns],
      // A fonte padrão do PDF não tem o sinal "−": usa o hífen comum.
      body: t.rows.map((r) => r.map((c) => formatCell(c, t.currency).replace(/\u2212/g, "-"))),
      margin: { left: margin, right: margin, bottom: 36 },
      styles: { font: "helvetica", fontSize: wide ? 6.5 : 8.5, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: Object.fromEntries(t.rows[0]?.map((c, i) => [i, { halign: c.format === "text" ? "left" : "right" }]) ?? []),
      // Título da coluna alinhado com os números dela.
      didParseCell: (data) => {
        if (data.section === "head") data.cell.styles.halign = t.rows[0]?.[data.column.index]?.format === "text" ? "left" : "right";
      },
      didDrawPage: footer,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(EMPTY_NOTE, margin, Math.min(y, pageHeight - 30));
  return doc.output("blob");
}
