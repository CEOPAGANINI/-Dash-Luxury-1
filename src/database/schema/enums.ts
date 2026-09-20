import { pgEnum } from "drizzle-orm/pg-core";

/** Papéis de membros do workspace (seção 30 do briefing) */
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "finance",
  "marketing",
  "support",
  "analyst",
  "viewer",
]);

/** Status padronizados de pagamento (seção 10 do briefing) */
export const paymentStatus = pgEnum("payment_status", [
  "created",
  "pending",
  "processing",
  "approved",
  "refused",
  "expired",
  "cancelled",
  "refunded",
  "partially_refunded",
  "chargeback",
]);

/** Estados de pedido (seção 18 do briefing) */
export const orderStatus = pgEnum("order_status", [
  "created",
  "awaiting_payment",
  "processing",
  "paid",
  "refused",
  "expired",
  "cancelled",
  "preparing",
  "shipped",
  "delivered",
  "refunded",
  "chargeback",
]);

export const cartStatus = pgEnum("cart_status", [
  "active",
  "abandoned",
  "converted",
  "expired",
  "recovered",
]);

export const productType = pgEnum("product_type", [
  "physical",
  "digital",
  "service",
  "subscription",
]);

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

export const publishStatus = pgEnum("publish_status", [
  "draft",
  "published",
  "unpublished",
  "archived",
]);

export const discountType = pgEnum("discount_type", ["percentage", "fixed"]);

export const payoutStatus = pgEnum("payout_status", [
  "upcoming",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);

export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "sale",
  "gateway_fee",
  "refund",
  "chargeback",
  "payout",
  "manual_adjustment",
  "manual_in",
  "manual_out",
  "product_cost",
  "shipping_cost",
  "commission",
  "tax",
]);

export const ledgerDirection = pgEnum("ledger_direction", ["in", "out"]);

export const integrationStatus = pgEnum("integration_status", [
  "disconnected",
  "connected",
  "error",
  "disabled",
]);

export const environment = pgEnum("environment", ["sandbox", "production"]);

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "success",
  "failed",
  "dead_letter",
]);

export const emailCampaignStatus = pgEnum("email_campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
]);

export const emailEventType = pgEnum("email_event_type", [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
]);

export const notificationChannel = pgEnum("notification_channel", [
  "in_app",
  "email",
  "web_push",
]);

export const pixelType = pgEnum("pixel_type", [
  "meta_pixel",
  "meta_capi",
  "gtm",
  "ga4",
  "google_ads",
  "tiktok_pixel",
  "utmify",
  "custom_script",
]);

export const integrationCategory = pgEnum("integration_category", [
  "payments",
  "analytics",
  "pixels",
  "email",
  "ads",
  "automation",
  "storage",
  "webhooks",
]);
