import { requirePageAdmin } from "@/lib/auth/session";
import { getOpeningSettings } from "@/features/cash/service";
import { OpeningForm } from "@/features/cash/opening-form";
import { todayJakarta } from "@/lib/date";
export default async function OpeningPage() {
  await requirePageAdmin();
  return <OpeningForm {...await getOpeningSettings()} today={todayJakarta()} />;
}
