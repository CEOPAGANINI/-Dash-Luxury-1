export type OperationId = "alpha" | "beta";
export type NetworkId = "all" | "meta" | "google" | "youtube";
export type PeriodPreset = "7d" | "30d" | "month" | "custom";

export interface OperationKpis {
  cash: number;
  netRevenue: number;
  contributionProfit: number;
  margin: number;
  mer: number;
  ncCac: number;
  orders: number;
  approval: number;
  ticket: number;
}

export interface TrafficNetwork {
  id: Exclude<NetworkId, "all">;
  name: string;
  color: string;
  spend: number;
  platformRevenue: number;
  checkoutRevenue: number;
  profit: number;
  newCustomers: number;
  purchases: number;
  impressions: number;
  clicks: number;
  status: string;
}

export interface Campaign {
  id: string;
  network: Exclude<NetworkId, "all">;
  name: string;
  objective: string;
  spend: number;
  platformRevenue: number;
  checkoutRevenue: number;
  profit: number;
  purchases: number;
  newCustomers: number;
  impressions: number;
  clicks: number;
  hook: number | null;
  hold: number | null;
  frequency: number;
  status: string;
}

export type FunnelStage = [
  label: string,
  value: number,
  rate: number,
  cost: number,
];

export interface FunnelDefinition {
  id: string;
  name: string;
  type: string;
  stages: FunnelStage[];
  demographics: number[];
  video: number[];
}

export interface OperationDefinition {
  id: OperationId;
  name: string;
  product: string;
  offer: string;
  owner: string;
  status: string;
  confidence: number;
  kpis: OperationKpis;
  networks: TrafficNetwork[];
  campaigns: Campaign[];
  funnels: Record<string, FunnelDefinition>;
}

export interface ProductRow {
  id: string;
  name: string;
  type: string;
  price: number;
  stock: string;
  status: string;
}

export interface OrderRow {
  ref: string;
  customer: string;
  product: string;
  total: number;
  status: string;
  gateway: string;
  date: string;
}

export interface CustomerRow {
  name: string;
  email: string;
  orders: number;
  revenue: number;
  consent: boolean;
  last: string;
}

export interface TransactionRow {
  date: string;
  description: string;
  category: string;
  type: "entrada" | "saida";
  value: number;
}

export interface NotificationRow {
  title: string;
  body: string;
  time: string;
  tone: "good" | "bad" | "warn" | "info";
}

export interface UnifiedDemoData {
  operations: Record<OperationId, OperationDefinition>;
  products: ProductRow[];
  orders: OrderRow[];
  customers: CustomerRow[];
  transactions: TransactionRow[];
  notifications: NotificationRow[];
}
