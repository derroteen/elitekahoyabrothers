// Export utilities: CSV, XLSX, PDF
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type Column = { header: string; key: string; align?: "left" | "right" | "center"; width?: number };

function dl(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(filename: string, columns: Column[], rows: any[]) {
  const head = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(",");
  const body = rows.map(r =>
    columns.map(c => {
      const v = r[c.key];
      const s = v == null ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    }).join(",")
  ).join("\n");
  dl(new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8" }), filename);
}

export function exportXLSX(filename: string, sheets: { name: string; columns: Column[]; rows: any[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.columns.map(c => c.header), ...s.rows.map(r => s.columns.map(c => r[c.key] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = s.columns.map(c => ({ wch: c.width ?? Math.max(12, c.header.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function exportPDF(filename: string, title: string, sections: { heading?: string; columns: Column[]; rows: any[] }[], meta?: { subtitle?: string }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString();
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Elite Kahoya Brothers", 40, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(title, 40, 58);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`${meta?.subtitle ?? ""}${meta?.subtitle ? " · " : ""}Generated ${today}`, 40, 72);
  doc.setTextColor(0);

  let y = 90;
  for (const s of sections) {
    if (s.heading) {
      if (y > 500) { doc.addPage(); y = 40; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(s.heading, 40, y); y += 6;
    }
    autoTable(doc, {
      startY: y,
      head: [s.columns.map(c => c.header)],
      body: s.rows.map(r => s.columns.map(c => {
        const v = r[c.key];
        return v == null ? "" : String(v);
      })),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillBy: undefined, fillColor: [11, 27, 60], textColor: 255, fontStyle: "bold" } as any,
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, { halign: c.align ?? "left" }])),
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const page = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Page ${page} of ${pageCount}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
        doc.setTextColor(0);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  doc.save(filename);
}
