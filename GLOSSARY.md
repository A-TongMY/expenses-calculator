# Expenses Calculator

A personal tool that shows how much of a monthly income is left after expenses, and whether a Scenario can be absorbed while keeping the current lifestyle.

## Language

**Income**:
The single fixed monthly amount of money coming in.
_Avoid_: Salary, budget, earnings

**Expense**:
Any money going out: the umbrella term for every kind of outgoing.
_Avoid_: Cost, spending (as the umbrella)

**Commitment**:
A fixed-amount Expense the user has agreed to pay, paid on a Cadence and optionally limited by a Start month and End month.
_Avoid_: Bill, fixed expense, obligation

**Lifestyle spending**:
A discretionary Expense you could choose to cut, such as food, fuel or a salon visit. It may be irregular and is entered as a low and a high estimate.
_Avoid_: Daily spending, variable expense, other

**Cadence**:
How often an Expense is paid: every month, every year, or every N months.
_Avoid_: Frequency, interval, recurrence

**Start month**:
The first month an Expense counts toward Remaining. An Expense without one already counts.
_Avoid_: Start date, begins

**End month**:
The last month an Expense counts toward Remaining, inclusive. An Expense without one never stops.
_Avoid_: End date, expiry

**Monthly cost**:
What an Expense costs in a single month, with its amount spread evenly over its Cadence.
_Avoid_: Amortized amount, average

**Estimate**:
The low and the high amount entered for a Lifestyle spending item.
_Avoid_: Budget, guess

**Check-in**:
An optional month-end entry of what was actually spent on one Lifestyle spending item, kept together with the Monthly cost range it was compared against.
_Avoid_: Log, transaction, reconciliation

**Gap**:
How a Check-in's actual spending compares with its Monthly cost range: under it, within it, or over it, and by how much.
_Avoid_: Variance, difference, overspend

**Real**:
An Expense that is not a Scenario, so it always counts toward Remaining.
_Avoid_: Actual, confirmed

**Scenario**:
A Commitment that is being considered but is not yet real.
_Avoid_: What-if, draft, simulation, prospective commitment

**Baseline**:
Remaining counting only real Expenses, with every Scenario ignored.
_Avoid_: Current, actual

**Projection**:
Remaining worked out for each of the coming months, honouring each Expense's Start month and End month.
_Avoid_: Forecast, timeline

**Tightest month**:
The month in the Projection with the lowest worst case.
_Avoid_: Worst month, low point

**Best case**:
Remaining when every Lifestyle spending item costs its low estimate.
_Avoid_: Optimistic, maximum

**Worst case**:
Remaining when every Lifestyle spending item costs its high estimate.
_Avoid_: Pessimistic, minimum

**Remaining**:
What is left of the Income after all Expenses, as a span from its Worst case to its Best case.
_Avoid_: Balance, surplus, savings

## Houses

**House**:
A housing loan being tracked: its Loan amount, yearly interest rate, term and first installment month, and optionally the property price and the bank's own Installment.
_Avoid_: Property, mortgage account

**Loan amount**:
The money borrowed for a House. The property price minus the down payment, when a price is entered.
_Avoid_: Principal (for the starting amount), debt

**Installment**:
The fixed amount paid to the bank each month. Calculated from the Loan amount, rate and term unless the user enters the bank's own figure.
_Avoid_: Payment (as the name of the fixed amount), EMI

**Schedule**:
The month-by-month list of every Installment of a House, split into interest and principal, with the balance left after each.
_Avoid_: Amortization table, statement

**Outstanding balance**:
What is still owed on a House after the Installments due up to and including this month.
_Avoid_: Remaining (reserved for what is left of Income)

**Total payable**:
Everything paid over the whole life of a House loan: the Loan amount plus all the interest.
_Avoid_: Total cost
