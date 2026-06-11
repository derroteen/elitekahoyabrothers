export const fmtKES = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return "KES " + v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const pad = (n: number) => String(n).padStart(2, "0");

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return `${fmtDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
