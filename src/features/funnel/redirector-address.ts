/** Public admin address only; credentials stay in the engine's login page. */
export function redirectorAdminAddress(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\./.test(host))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function redirectorCampaignAddress(address: string, campaignId?: string): string {
  if (!campaignId || !/^[1-9]\d{0,11}$/.test(campaignId)) return address;
  const url = new URL("campsettings.php", address);
  url.searchParams.set("campId", campaignId);
  return url.href;
}

