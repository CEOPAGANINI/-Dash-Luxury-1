/**
 * Dados legais da empresa, usados nas páginas obrigatórias (Termos,
 * Privacidade, Cookies, Devoluções).
 *
 * ⚠️ PREENCHA ANTES DE ANUNCIAR. Em Portugal, a lei do comércio eletrónico
 * (DL 7/2004) obriga a identificar o vendedor: denominação, NIF, morada e
 * contactos. Campos vazios aparecem marcados como pendentes nas páginas
 * públicas e no painel, em vez de dados inventados.
 */
export const company = {
  /** Denominação social (ex.: "Victor Silva, Unipessoal Lda.") */
  legalName: "",
  /** Nome comercial exibido ao cliente */
  tradeName: "TechNébula",
  /** NIF / NIPC português (9 dígitos) */
  taxId: "",
  /** Morada da sede */
  address: "",
  postalCode: "",
  city: "",
  country: "Portugal",
  /** Contactos de apoio ao cliente */
  email: "apoio@technebula.pt",
  phone: "",
} as const;

export interface CompanyGap {
  field: string;
  label: string;
}

/** Campos legais ainda por preencher. */
export function missingCompanyFields(): CompanyGap[] {
  const required: CompanyGap[] = [
    { field: "legalName", label: "Denominação social" },
    { field: "taxId", label: "NIF / NIPC" },
    { field: "address", label: "Morada da sede" },
    { field: "postalCode", label: "Código postal" },
    { field: "city", label: "Localidade" },
  ];
  return required.filter(
    (r) => !company[r.field as keyof typeof company]?.toString().trim(),
  );
}

export function isCompanyComplete(): boolean {
  return missingCompanyFields().length === 0;
}

/** Linha de identificação do vendedor, para rodapés e páginas legais. */
export function companyIdentification(): string {
  if (!isCompanyComplete()) return "";
  return `${company.legalName}, NIF ${company.taxId}, ${company.address}, ${company.postalCode} ${company.city}, ${company.country}`;
}
