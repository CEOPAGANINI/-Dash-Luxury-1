import type { Metadata } from "next";

import { CatalogPanel } from "@/features/catalog/catalog-panel";
import { getCatalogData } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Produtos" };

export default async function Page() {
  return <CatalogPanel data={await getCatalogData()} mode="products" />;
}
