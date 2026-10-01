import type { Metadata } from "next";

import { CatalogPanel } from "@/features/catalog/catalog-panel";
import { getCatalogData } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Catálogo · Estoque" };

export default async function EstoquePage() {
  return <CatalogPanel data={await getCatalogData()} mode="inventory" />;
}
