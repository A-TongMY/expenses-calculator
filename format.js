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
  if (everyMonths === 1) return "every month";
  if (everyMonths === 12) return "every year";
  return `every ${everyMonths} months`;
};

export const periodLabel = ({ startMonth, endMonth }) =>
  [startMonth && `from ${monthLabel(startMonth)}`, endMonth && `until ${monthLabel(endMonth)}`]
    .filter(Boolean)
    .join(" ");
