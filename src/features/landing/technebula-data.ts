/**
 * Conteúdo da landing page TechNébula — cadeira ALPHA GAMER Nébula.
 *
 * Edite este arquivo para ajustar preço, estoque e textos.
 * IMPORTANTE: preencha avaliações e estoque apenas com dados REAIS da sua
 * operação — números inventados configuram publicidade enganosa.
 */

export const techNebulaStore = {
  name: "TechNébula",
  tagline: "Tecnologia e gaming com entrega rápida em todo Portugal",
  supportEmail: "apoio@technebula.pt",
} as const;

export interface ProductReview {
  /** Nome exibido (ex.: "Luís Pereira" ou "Inês C.") */
  name: string;
  /** Cidade do cliente */
  location: string;
  /** Data ISO (ex.: "2026-07-22") */
  date: string;
  /** 1 a 5 */
  stars: number;
  title: string;
  text: string;
  /** Quantas pessoas marcaram como útil */
  helpful: number;
  /** true somente para avaliações vindas de pedidos reais pagos */
  verifiedPurchase: boolean;
  /** Caminho de foto enviada pelo cliente (opcional), em /public */
  photo?: string;
}

export interface LandingProduct {
  slug: string;
  name: string;
  brand: string;
  shortPitch: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  mainImage: string;
  gallery: string[];
  /** null = não exibir avaliações (preencher só com avaliações reais) */
  rating: { value: number; count: number } | null;
  /** null = não exibir contador de estoque (preencher com estoque real) */
  stockRemaining: number | null;
  stockTotal: number;
  freeShippingFromCents: number;
  deliveryEstimate: string;
  returnDays: number;
  description: string[];
  highlights: string[];
  specs: [string, string][];
  /**
   * Avaliações REAIS de clientes. Começa vazio — a seção "Avaliações dos
   * clientes" só aparece quando houver itens aqui. Nunca preencha com
   * depoimentos inventados: isso é publicidade enganosa e crime de burla.
   *
   * Formato de exemplo (apague o comentário ao usar):
   * {
   *   name: "Nome do Cliente",
   *   location: "Lisboa",
   *   date: "2026-08-15",
   *   stars: 5,
   *   title: "Muito boa",
   *   text: "Chegou rápido e é confortável.",
   *   helpful: 0,
   *   verifiedPurchase: true, // apenas se veio de pedido pago na sua loja
   *   photo: "/landing/reviews/foto1.jpg", // opcional
   * }
   */
  reviews: ProductReview[];
}

export const alphaGamerNebula: LandingProduct = {
  slug: "cadeira-gaming-alpha-gamer-nebula",
  name: "Cadeira Gaming ALPHA GAMER Nébula",
  brand: "ALPHA GAMER",
  shortPitch:
    "Conforto e ergonomia para longas sessões de jogo ou trabalho — reclinação até 180°, suporte até 130 kg.",
  priceCents: 3990,
  compareAtPriceCents: 19990,
  currency: "EUR",
  mainImage: "/landing/alpha-gamer-nebula.webp",
  gallery: [
    "/landing/alpha-gamer-nebula.webp",
    "/landing/nebula-1.jpg",
    "/landing/nebula-2.jpg",
    "/landing/nebula-3.jpg",
    "/landing/nebula-4.jpg",
  ],
  // Sem avaliações inventadas: ative apenas quando houver avaliações reais.
  rating: null,
  stockRemaining: 7,
  stockTotal: 40,
  freeShippingFromCents: 1999,
  deliveryEstimate: "2–4 dias úteis",
  returnDays: 14,
  description: [
    "A cadeira Gaming ALPHA GAMER Nébula é uma excelente escolha para quem procura conforto e ergonomia durante longas sessões de jogos ou trabalho. Com dimensões de 48 × 70 × 124–133 cm e suporte até 130 kg, é ideal para utilizadores entre 1,5 m e 2 m de altura.",
    "O enchimento em espuma de 43–45 kg/m³ oferece suporte firme e confortável, e as almofadas amovíveis garantem apoio extra para a cabeça e zona lombar. O encosto reclina até 180° e o assento conta com função de balanço.",
    "Os apoios de braço ajustam-se em altura e rotação horizontal. As cinco rodas duplas com rotação 360° garantem liberdade de movimento. Construção em aço, plástico, camurça e espuma — robusta, durável e com acabamento moderno em cinzento.",
  ],
  highlights: [
    "Peso máximo: 130 kg",
    "Elevador a gás Classe 4",
    "Reclinação até 180°",
    "5 rodas duplas com rotação 360°",
    "Almofadas de cabeça e lombar amovíveis",
  ],
  specs: [
    ["Marca", "ALPHA GAMER"],
    ["Modelo", "Nébula"],
    ["Cor", "Cinzento"],
    ["Dimensões", "48 × 70 × 124–133 cm"],
    ["Peso do produto", "25 kg"],
    ["Peso máximo suportado", "130 kg"],
    ["Materiais", "Aço, plástico, camurça e espuma"],
  ],
  // Vazio até existirem avaliações reais (ver comentário na interface).
  reviews: [],
};
