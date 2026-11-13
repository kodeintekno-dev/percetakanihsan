import { requirePageAdmin } from "@/lib/auth/session";
import { listAssets } from "@/features/assets/service";
import { AssetManager } from "@/features/assets/asset-manager";
import { todayJakarta } from "@/lib/date";
export default async function AssetPage() {
  await requirePageAdmin();
  return <AssetManager initial={await listAssets()} today={todayJakarta()} />;
}
