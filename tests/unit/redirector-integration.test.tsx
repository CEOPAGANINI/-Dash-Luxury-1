import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { redirectorAdminAddress, redirectorCampaignAddress } from "../../src/features/funnel/redirector-address";
import { RedirectorEngine } from "../../src/features/funnel/redirector-engine";
import { funnelDataSchema } from "../../src/features/funnel/funnel-validation";

describe("hosted redirector integration", () => {
  it("accepts HTTPS admin addresses without login credentials", () => {
    expect(redirectorAdminAddress(" https://links.example.org/admin/index.php ")).toBe("https://links.example.org/admin/index.php");
  });
  it.each([undefined, "", "wrong", "http://example.org/admin", "https://localhost/admin", "https://127.0.0.1/admin", "https://[::1]/admin", "https://user:password@example.org/admin", "https://example.org/admin?token=secret", "javascript:alert(1)"])("rejects unsafe or local entry %s", (address) => {
    expect(redirectorAdminAddress(address)).toBeNull();
  });
  it("opens the linked campaign without losing the admin directory", () => {
    expect(redirectorCampaignAddress("https://links.example.org/admin/index.php", "42")).toBe("https://links.example.org/admin/campsettings.php?campId=42");
    expect(redirectorCampaignAddress("https://links.example.org/admin/index.php", "../bad")).toBe("https://links.example.org/admin/index.php");
  });
  it("shows an honest pending state without an iframe when hosting is absent", () => {
    const html = renderToStaticMarkup(<RedirectorEngine address={null} onCampaignChange={() => {}} />);
    expect(html).toContain("Aguardando");
    expect(html).not.toContain("<iframe");
  });
  it("embeds and links the same campaign with a titled frame", () => {
    const html = renderToStaticMarkup(<RedirectorEngine address="https://links.example.org/admin/index.php" campaignId="42" onCampaignChange={() => {}} />);
    expect(html).toContain('src="https://links.example.org/admin/campsettings.php?campId=42"');
    expect(html).toContain('title="Administração do redirecionador YellowTDS"');
    expect(html).toContain('href="https://links.example.org/admin/campsettings.php?campId=42"');
  });
  it("preserves campaign links when validating saved funnels and accepts old drafts", () => {
    const base = { id: "f1", projeto: "Projeto", nome: "Meu funil", nodes: [{ id: "n1", type: "redirect", x: 0, y: 0, title: "Rotas", redir: { regras: [], campanhaId: "42" } }], edges: [] };
    const parsed = funnelDataSchema.parse(base);
    expect(parsed.nodes[0].redir?.campanhaId).toBe("42");
    expect(funnelDataSchema.safeParse({ ...base, nodes: [{ ...base.nodes[0], redir: { regras: [] } }] }).success).toBe(true);
    expect(funnelDataSchema.safeParse({ ...base, nodes: [{ ...base.nodes[0], redir: { regras: [], campanhaId: "../bad" } }] }).success).toBe(false);
  });
});

