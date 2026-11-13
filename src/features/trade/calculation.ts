import { ExactDecimal } from "@/lib/money";
export function invoiceState(
  amount: string,
  paid: string,
  dueDate: string,
  today: string,
  cancelled = false,
) {
  const remaining = new ExactDecimal(amount).sub(paid);
  return {
    remaining: remaining.toFixed(0),
    status: cancelled
      ? ("CANCELLED" as const)
      : remaining.isZero()
        ? ("PAID" as const)
        : new ExactDecimal(paid).gt(0)
          ? ("PARTIAL" as const)
          : ("OPEN" as const),
    overdue: !cancelled && remaining.gt(0) && dueDate < today,
  };
}
