import "@/features/ads/campaigns.css";

export default function CampaignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="campaign-workspace">{children}</div>;
}
