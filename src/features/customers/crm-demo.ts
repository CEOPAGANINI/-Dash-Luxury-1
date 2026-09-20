import type { CustomerRow } from "./queries";

/*
  Clientes de demonstração para o CRM.

  Sem banco, a lista real é vazia — e uma página vazia não mostra como o
  CRM organiza as pessoas. Estas doze fichas cobrem os seis segmentos, com
  datas relativas a hoje para os cortes de 30 e 90 dias caírem onde devem.
  Tudo fictício, e a página diz isso.
*/

const DIA = 86_400_000;

interface Semente {
  nome: string;
  email: string;
  telefone?: string;
  pais: string;
  pedidos: number;
  pagos: number;
  gastoCents: number;
  /** Dias atrás do último pedido; null = nunca pediu. */
  ultimoHaDias: number | null;
  /** Dias atrás do primeiro pedido. */
  primeiroHaDias: number | null;
  optOut?: boolean;
}

const SEMENTES: Semente[] = [
  { nome: "Mariana Silva", email: "mariana@email.com", telefone: "+55 11 98888-0101", pais: "BR", pedidos: 5, pagos: 5, gastoCents: 148_500, ultimoHaDias: 4, primeiroHaDias: 210 },
  { nome: "Renato Freitas", email: "renato@email.com", telefone: "+55 21 97777-0202", pais: "BR", pedidos: 3, pagos: 3, gastoCents: 89_100, ultimoHaDias: 12, primeiroHaDias: 150 },
  { nome: "Carla Mendes", email: "carla@email.com", pais: "BR", pedidos: 1, pagos: 1, gastoCents: 49_700, ultimoHaDias: 6, primeiroHaDias: 6, optOut: true },
  { nome: "João Pereira", email: "joao@email.com", telefone: "+55 31 96666-0303", pais: "BR", pedidos: 2, pagos: 2, gastoCents: 31_690, ultimoHaDias: 19, primeiroHaDias: 64 },
  { nome: "Beatriz Nogueira", email: "bia.nogueira@email.com", pais: "BR", pedidos: 1, pagos: 1, gastoCents: 29_700, ultimoHaDias: 2, primeiroHaDias: 2 },
  { nome: "Felipe Andrade", email: "felipe.andrade@email.com", pais: "BR", pedidos: 1, pagos: 1, gastoCents: 19_700, ultimoHaDias: 27, primeiroHaDias: 27 },
  { nome: "Luciana Prado", email: "luciana.prado@email.com", telefone: "+55 41 95555-0404", pais: "BR", pedidos: 2, pagos: 2, gastoCents: 59_400, ultimoHaDias: 118, primeiroHaDias: 240 },
  { nome: "Tiago Ramos", email: "tiago.ramos@email.com", pais: "PT", pedidos: 1, pagos: 1, gastoCents: 24_900, ultimoHaDias: 97, primeiroHaDias: 97 },
  { nome: "Paula Cardoso", email: "paula.cardoso@email.com", pais: "BR", pedidos: 3, pagos: 0, gastoCents: 0, ultimoHaDias: 3, primeiroHaDias: 9 },
  { nome: "Marcos Vinícius", email: "marcos.v@email.com", pais: "BR", pedidos: 1, pagos: 0, gastoCents: 0, ultimoHaDias: 1, primeiroHaDias: 1 },
  { nome: "Aline Souza", email: "aline.souza@email.com", pais: "BR", pedidos: 0, pagos: 0, gastoCents: 0, ultimoHaDias: null, primeiroHaDias: null },
  { nome: "Rodrigo Teixeira", email: "rodrigo.t@email.com", pais: "BR", pedidos: 0, pagos: 0, gastoCents: 0, ultimoHaDias: null, primeiroHaDias: null },
];

export function demoCustomerRows(agora = Date.now()): CustomerRow[] {
  return SEMENTES.map((s, i) => ({
    id: `demo-${i + 1}`,
    name: s.nome,
    email: s.email,
    phone: s.telefone ?? null,
    country: s.pais,
    orderCount: s.pedidos,
    paidCount: s.pagos,
    totalSpentCents: s.gastoCents,
    averageTicketCents: s.pagos > 0 ? Math.round(s.gastoCents / s.pagos) : 0,
    lastOrderAt: s.ultimoHaDias === null ? null : new Date(agora - s.ultimoHaDias * DIA),
    firstOrderAt:
      s.primeiroHaDias === null ? null : new Date(agora - s.primeiroHaDias * DIA),
    marketingOptOut: Boolean(s.optOut),
    isBlocked: false,
    createdAt: new Date(agora - ((s.primeiroHaDias ?? 30) + 5) * DIA),
  }));
}
