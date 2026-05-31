export const fmtKES = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return "KES " + v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "2-digit" });
};
