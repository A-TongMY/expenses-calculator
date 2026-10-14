const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function renovationDate(now = new Date()) {
  const parts = Object.fromEntries(
    dateFormat.formatToParts(now)
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const renovationMonth = (now = new Date()) => renovationDate(now).slice(0, 7);
