export const money = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });

export const range = (low, high) =>
  low === high ? money.format(low) : `${money.format(low)} – ${money.format(high)}`;

const monthFormat = new Intl.DateTimeFormat("en-MY", { month: "short", year: "numeric" });

export const monthLabel = (month) => {
  const [year, number] = month.split("-").map(Number);
  return monthFormat.format(new Date(year, number - 1, 1));
};

export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const cadenceLabel = (everyMonths) => {
  if (everyMonths === 1) return "monthly";
  if (everyMonths === 12) return "yearly";
  return `every ${everyMonths} months`;
};

export const periodLabel = ({ startMonth, endMonth }) => {
  if (startMonth && endMonth) return `${monthLabel(startMonth)} – ${monthLabel(endMonth)}`;
  if (startMonth) return `from ${monthLabel(startMonth)}`;
  if (endMonth) return `until ${monthLabel(endMonth)}`;
  return "";
};

export const termLabel = (months) => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [
    years && `${years} ${years === 1 ? "year" : "years"}`,
    rest && `${rest} ${rest === 1 ? "month" : "months"}`,
  ]
    .filter(Boolean)
    .join(" ");
};
