import Link from "next/link";
import { getOperationSettings } from "@/features/settings/operation";
import { saveOperationAction } from "@/features/settings/operation-actions";
import { SettingsForm } from "@/features/settings/settings-form";
export const metadata = { title: "Configurar operação" };
export default async function Page() {
  const config = await getOperationSettings();
  return (
    <div className="cfg-devmode">
      <header className="cfg-cabecalho">
        <div>
          <h2>Operação</h2>
          <p>
            Identidade e contatos persistidos da sua conta. Valores não mudam o
            histórico de pedidos nem o domínio da Vercel.
          </p>
        </div>
      </header>
      <section className="cfg-card">
        <SettingsForm action={saveOperationAction}>
          <div className="cfg-fields">
            <label>
              Nome da operação
              <input
                name="name"
                defaultValue={config.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              Fuso de referência
              <select name="timezone" defaultValue={config.timezone}>
                {[
                  "America/Sao_Paulo",
                  "America/Manaus",
                  "America/Fortaleza",
                  "Europe/Lisbon",
                  "UTC",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Moeda do relatório
              <select name="currency" defaultValue={config.currency}>
                <option>BRL</option>
                <option>EUR</option>
              </select>
            </label>
            <label>
              E-mail de suporte
              <input
                type="email"
                name="supportEmail"
                defaultValue={config.supportEmail}
              />
            </label>
            <label>
              Endereço do suporte
              <input
                type="url"
                name="supportUrl"
                defaultValue={config.supportUrl}
                placeholder="https://…"
              />
            </label>
            <label>
              Site público
              <input
                type="url"
                name="website"
                defaultValue={config.website}
                placeholder="https://…"
              />
            </label>
          </div>
        </SettingsForm>
      </section>
      <section className="cfg-grade">
        {[
          [
            "Funil e páginas",
            "/editor/landing-page",
            "ZIPs, SEO, ligações, upsell e downsell",
          ],
          [
            "Checkout",
            "/editor/checkout",
            "Produtos, aparência e métodos de pagamento",
          ],
          ["Entrega", "/editor/fretes", "Opções e valores de frete"],
          ["Rastreamento", "/pixel", "Pixels e eventos da operação"],
          [
            "Servidor",
            "/servidor",
            "Conectar VPS, domínio, arquivos e publicação",
          ],
          ["Notificações", "/notificacoes", "Avisos e Pushcut"],
        ].map(([title, href, detail]) => (
          <Link key={href} href={href} className="cfg-card">
            <h3>{title}</h3>
            <p>{detail}</p>
            <span>Configurar →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
