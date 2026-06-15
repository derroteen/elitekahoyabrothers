export const fmtKES = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return "KES " + v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  // Always DD/MM/YYYY. Parse ISO date strings without timezone shift.
  let y: string, m: string, day: string;
  if (typeof d === "string") {
    const raw = d.split("T")[0];
    const parts = raw.split("-");
    if (parts.length === 3) {
      [y, m, day] = parts;
      return `${day}/${m}/${y}`;
    }
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
