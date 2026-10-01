import type { Metadata } from "next";

import { CatalogPanel } from "@/features/catalog/catalog-panel";
import { getCatalogData } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Catálogo · Categorias" };

export default async function CategoriasPage() {
  return <CatalogPanel data={await getCatalogData()} mode="categories" />;
}
