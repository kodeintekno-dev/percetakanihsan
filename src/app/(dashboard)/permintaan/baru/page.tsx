import { requirePageAdmin } from "@/lib/auth/session";
import { getCategoryRows } from "@/features/categories/service";
import { todayJakarta } from "@/lib/date";
import { OrderForm } from "@/features/orders/order-form";
export default async function NewOrderPage() {
  await requirePageAdmin();
  return (
    <OrderForm categories={await getCategoryRows()} today={todayJakarta()} />
  );
}
