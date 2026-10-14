export const emptyRenovation = () => ({
  renovationCategories: [], renovationItems: [], renovationPayments: [],
});

export const fixture = () => ({
  income: 0,
  commitments: [],
  lifestyle: [],
  spending: [],
  houses: [{
    id: "h1", name: "House One", loan: 100000,
    ratePercent: 0, termMonths: 120, startMonth: "2026-01",
  }],
  renovationCategories: [{ id: "kitchen", houseId: "h1", name: "Kitchen" }],
  renovationItems: [{
    id: "cabinets", houseId: "h1", categoryId: "kitchen", name: "Cabinets",
    budget: 10000, actualCost: 12000,
    installmentPlan: { startMonth: "2026-10", amount: 1000, count: 10 },
  }],
  renovationPayments: [{
    id: "deposit", itemId: "cabinets", date: "2026-10-01",
    amount: 2000, kind: "deposit",
  }],
});
