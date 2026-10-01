import Link from "next/link";
import { getAppUrl } from "@/lib/app-url";
import { getDiagnostics } from "@/features/settings/diagnostics";
import {
  applySchemaAction,
  saveMetaPeriodAction,
  testConnectionAction,
} from "@/features/settings/diagnostic-actions";
import { SettingsForm } from "@/features/settings/settings-form";
export const metadata = { title: "Diagnóstico da operação" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const d = await getDiagnostics();
  return (
    <div className="cfg-devmode">
      <header className="cfg-cabecalho">
        <div>
          <h2>Diagnóstico da operação</h2>
          <p>
            Verificado em{" "}
            {new Date(d.checkedAt).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}{" "}
            · versão {d.version}. Presença de chave não significa integração
            ativa.
          </p>
        </div>
        <Link className="cfg-botao" href="/configuracoes/diagnosticos">
          Verificar novamente
        </Link>
      </header>
      <section className="cfg-grade">
        {[
          [
            "Banco de dados",
            d.reachable ? `Respondeu em ${d.latencyMs} ms` : "Indisponível",
          ],
          [
            "Salvamento do funil",
            d.vaults ? "Estrutura pronta" : "Preparação pendente",
          ],
          [
            "Proteção do rastreamento",
            d.tracking ? "Limite persistente pronto" : "Preparação pendente",
          ],
          [
            "VPS e sites",
            d.detailsAvailable
              ? `${d.counts.servers} servidores · ${d.counts.sites} sites`
              : "Leitura indisponível",
          ],
        ].map(([title, state]) => (
          <div className="cfg-card" key={title}>
            <h3>{title}</h3>
            <p>{state}</p>
          </div>
        ))}
      </section>
      {!d.schemaReady && d.access.role === "owner" && (
        <section className="cfg-card">
          <h3>Preparar recursos novos</h3>
          <p>
            Cria apenas as tabelas de salvamento, histórico e limites. Não apaga
            conteúdo existente nem troca senhas.
          </p>
          <form action={applySchemaAction}>
            <button className="cfg-botao-primario">
              Preparar banco do funil e rastreamento
            </button>
          </form>
        </section>
      )}
      <section className="cfg-card">
        <h3>Registros desta operação</h3>
        {d.detailsAvailable ? (
          <p>
            {d.counts.products} produtos · {d.counts.checkouts} checkouts ·{" "}
            {d.counts.orders} pedidos. Nenhum dado de outra conta entra nessa
            contagem.
          </p>
        ) : (
          <p>
            A contagem não pôde ser consultada. Isso não significa que seus
            registros foram apagados.
          </p>
        )}
      </section>
      <section className="cfg-card">
        <h3>Credenciais do projeto</h3>
        <div className="cfg-table-wrap">
          <table>
            <caption className="sr-only">
              Nomes das variáveis e presença, sem valores
            </caption>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Variáveis</th>
                <th>Presença</th>
              </tr>
            </thead>
            <tbody>
              {d.services.map((s) => (
                <tr key={s.id}>
                  <td>{s.nome}</td>
                  <td>
                    {s.variaveis.map((v) => (
                      <div key={v.nome}>
                        <code>{v.nome}</code> ·{" "}
                        {v.presente
                          ? "presente"
                          : v.opcional
                            ? "opcional ausente"
                            : "ausente"}
                      </div>
                    ))}
                  </td>
                  <td>
                    {s.configurado ? "Configurado, não testado" : "Incompleto"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="cfg-card">
        <h3>Integrações salvas</h3>
        <Link href="/integracoes" className="cfg-botao">
          Adicionar ou trocar credenciais
        </Link>
        {!d.sourcesAvailable && (
          <p>Não foi possível consultar as integrações agora.</p>
        )}
        {d.sourcesAvailable && d.sources.length === 0 && (
          <p>Nenhuma integração salva nesta operação.</p>
        )}
        {d.sources.map((s) => (
          <div className="cfg-source" key={s.key}>
            <h4>{s.name}</h4>
            <p>
              {s.verification === "verified"
                ? "Leitura validada"
                : s.verification === "failed"
                  ? "Último teste falhou"
                  : "Credencial salva, sem teste de leitura"}
              {s.testedAt
                ? ` · ${new Date(s.testedAt).toLocaleString("pt-BR")}`
                : ""}{" "}
              · sincronização:{" "}
              {s.lastSyncAt?.toLocaleString("pt-BR") ?? "ainda não registrada"}{" "}
              · último evento:{" "}
              {s.lastEventAt?.toLocaleString("pt-BR") ?? "nenhum"}
            </p>
            {["meta", "shopify"].includes(s.key) && (
              <SettingsForm
                action={testConnectionAction}
                label="Testar acesso sem alterar dados"
              >
                <input type="hidden" name="id" value={s.key} />
              </SettingsForm>
            )}
            {s.key === "meta" && (
              <SettingsForm
                action={saveMetaPeriodAction}
                label="Salvar período do Meta"
              >
                <label>
                  Período da próxima sincronização
                  <select name="period" defaultValue={s.metricsPeriod}>
                    {[
                      "last_7d",
                      "last_30d",
                      "today",
                      "yesterday",
                      "this_month",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <Link href="/campanhas/meta/gerenciador" className="cfg-botao">
                  Abrir sincronização
                </Link>
              </SettingsForm>
            )}
          </div>
        ))}
      </section>
      <section className="cfg-card">
        <h3>Webhook de pagamentos desta conta</h3>
        <p>
          Para o adaptador Broski. Outros processadores não são anunciados como
          ativos enquanto não houver um adaptador completo. A assinatura é
          obrigatória.
        </p>
        <code className="cfg-break">{`${getAppUrl()}/api/webhooks/gateway?loja=${d.access.workspaceId}`}</code>
      </section>
      <section className="cfg-card">
        <h3>Próxima conexão</h3>
        <p>
          Uma VPS real ainda precisa estar cadastrada e com agente autorizado. O
          painel não inventa servidor, senha ou resultado de pagamento.
        </p>
        <Link href="/servidor/novo" className="cfg-botao">
          Configurar VPS
        </Link>
      </section>
    </div>
  );
}
