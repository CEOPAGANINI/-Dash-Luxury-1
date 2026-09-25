import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  Link2,
  Lock,
  Mail,
  Server,
  Shield,
  Wallet,
  XCircle,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getGuardrails } from "@/features/guardrails/queries";
import { getPushcutStatus } from "@/features/notifications/pushcut";
import {
  listConnections,
  oauthAvailability,
} from "@/features/integrations/connections-store";
import {
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { catalogoDeServicos } from "@/features/settings/servicos";
import {
  CartaoDaTaxa,
  CartaoDosDadosLocais,
  CartaoDoTema,
} from "@/features/settings/preferencias";

export const metadata: Metadata = { title: "Configurações" };

/* O ícone de cada serviço do catálogo, pelo id. */
const ICONE: Record<string, React.ReactNode> = {
  banco: <Database />,
  supabase: <Shield />,
  cripto: <Lock />,
  "app-url": <Globe />,
  "oauth-meta": <Link2 />,
  "oauth-google": <Link2 />,
  utmify: <Globe />,
  broski: <Wallet />,
  stripe: <Wallet />,
  "mercado-pago": <Wallet />,
  pagarme: <Wallet />,
  asaas: <Wallet />,
  resend: <Mail />,
  upstash: <Server />,
  vps: <Server />,
};

const GRUPOS: { id: string; rotulo: string }[] = [
  { id: "essencial", rotulo: "Essenciais" },
  { id: "anuncios", rotulo: "Anúncios e rastreamento" },
  { id: "pagamentos", rotulo: "Pagamentos" },
  { id: "outros", rotulo: "E-mails, filas e servidores" },
];

export default async function ConfiguracoesPage() {
  const bancoConfigurado = isDatabaseConfigured();
  const servicos = catalogoDeServicos(process.env);
  const [{ regras, persistidas }, pushcut, conexoes, oauth] = await Promise.all(
    [
      getGuardrails(),
      getPushcutStatus(),
      listConnections(),
      Promise.resolve(oauthAvailability()),
    ],
  );

  const dinheiro = (cents: number) =>
    cents > 0 ? formatCurrency(cents / 100, 0) : "sem limite";
  const freio: [string, string][] = [
    ["Margem mínima", formatPercent(regras.margemMinima, 0)],
    ["ROAS mínimo", formatRatio(regras.roasMinimo)],
    ["ROAS de pausa", formatRatio(regras.roasPausa)],
    ["Gasto máximo por dia", dinheiro(regras.gastoMaximoDia)],
    ["Escala máxima", formatPercent(regras.escalaMaxima, 0)],
    [
      "Dia negativo",
      regras.pausarDiaNegativo
        ? `pausa após ${regras.diasToleranciaNegativo} ${regras.diasToleranciaNegativo === 1 ? "dia" : "dias"}`
        : "não pausa",
    ],
    ["Aprovação manual acima de", formatCurrency(regras.aprovacaoAcimaDe, 0)],
  ];

  const contas: { id: "meta" | "google" | "youtube"; nome: string }[] = [
    { id: "meta", nome: "Meta Ads" },
    { id: "google", nome: "Google Ads" },
    { id: "youtube", nome: "YouTube Ads" },
  ];
  const estadoDaConta = (id: "meta" | "google" | "youtube") => {
    if (conexoes[id]) return { rotulo: "Conectada", tom: "sucesso" as const };
    const pronto = id === "meta" ? oauth.meta : oauth.google;
    return pronto
      ? { rotulo: "Pronta para conectar", tom: "neutro" as const }
      : { rotulo: "Faltam credenciais", tom: "neutro" as const };
  };

  return (
    <div className="cfg-devmode" data-design="devmode">
      {/* Cabeçalho: título, o que a página faz e as duas ações. */}
      <div className="cfg-cabecalho">
        <div>
          <h2>Configurações</h2>
          <p>
            Tudo o que o painel deixa configurar, num lugar só: preferências
            deste navegador, o freio de mão do lucro, as notificações, as contas
            de anúncio e as credenciais de cada serviço. Os valores das chaves
            nunca aparecem aqui — o painel só confere a presença.
          </p>
        </div>
        <div className="cfg-acoes">
          <Link href="/seguranca" className="cfg-botao">
            <Shield aria-hidden="true" /> Regras de lucro
          </Link>
          <Link href="/integracoes" className="cfg-botao-primario">
            <Link2 aria-hidden="true" /> Conectar dados reais
          </Link>
        </div>
      </div>

      {!bancoConfigurado && (
        <div className="cfg-alerta" role="note">
          <AlertTriangle aria-hidden="true" />
          <div>
            <h3>Modo demonstração</h3>
            <p>
              Sem <code>DATABASE_URL</code> o painel mostra números de exemplo e
              nada é guardado. Defina as variáveis do banco e do Supabase na
              Vercel e faça um novo deploy para sair deste modo.
            </p>
          </div>
        </div>
      )}

      {/* Preferências deste navegador. */}
      <section className="cfg-secao" aria-labelledby="cfg-prefs">
        <h2 id="cfg-prefs">Preferências deste navegador</h2>
        <div className="cfg-grade">
          <CartaoDoTema />
          <CartaoDaTaxa />
        </div>
      </section>

      {/* O freio de mão. */}
      <section className="cfg-secao" aria-labelledby="cfg-freio">
        <h2 id="cfg-freio">Proteção do lucro</h2>
        <div className="cfg-card">
          <div className="cfg-card-topo">
            <div className="cfg-card-titulo">
              <span className="cfg-icone" aria-hidden="true">
                <Shield />
              </span>
              <div>
                <h3>Freio de mão das campanhas</h3>
                <p>
                  As regras que pausam verba e pedem aprovação.{" "}
                  {persistidas
                    ? "Salvas no banco."
                    : "Valores padrão — ainda não foram salvas."}
                </p>
              </div>
            </div>
            <Link href="/seguranca" className="cfg-botao">
              Editar em Segurança
            </Link>
          </div>
          <dl className="cfg-fichas">
            {freio.map(([nome, valor]) => (
              <div key={nome}>
                <dt>{nome}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Notificações e contas de anúncio, lado a lado. */}
      <section className="cfg-secao" aria-labelledby="cfg-ligacoes">
        <h2 id="cfg-ligacoes">Notificações e contas</h2>
        <div className="cfg-grade">
          <div className="cfg-card">
            <div className="cfg-card-topo">
              <div className="cfg-card-titulo">
                <span className="cfg-icone" aria-hidden="true">
                  <Bell />
                </span>
                <div>
                  <h3>Push no celular (Pushcut)</h3>
                  <p>
                    {pushcut.configured
                      ? pushcut.isActive
                        ? `Ativo · notificação “${pushcut.notificationName}”`
                        : "Configurado, mas desligado"
                      : "Ainda não configurado — precisa do banco e da chave do Pushcut."}
                  </p>
                </div>
              </div>
              <span
                className="cfg-selo"
                data-tom={
                  pushcut.configured && pushcut.isActive ? "sucesso" : "neutro"
                }
              >
                {pushcut.configured
                  ? pushcut.isActive
                    ? "Ativo"
                    : "Desligado"
                  : "Não configurado"}
              </span>
            </div>
            <div className="cfg-chips">
              {pushcut.events.map((e) => (
                <code key={e}>{e}</code>
              ))}
            </div>
            {pushcut.lastError && (
              <p className="cfg-aviso-campo">
                Último erro: {pushcut.lastError}
              </p>
            )}
            <Link href="/notificacoes" className="cfg-link">
              Editar em Notificações
            </Link>
          </div>

          <div className="cfg-card">
            <div className="cfg-card-topo">
              <div className="cfg-card-titulo">
                <span className="cfg-icone" aria-hidden="true">
                  <Link2 />
                </span>
                <div>
                  <h3>Contas de anúncio</h3>
                  <p>De onde vêm as campanhas de verdade.</p>
                </div>
              </div>
            </div>
            <ul className="cfg-lista">
              {contas.map((c) => {
                const estado = estadoDaConta(c.id);
                return (
                  <li key={c.id}>
                    <span>{c.nome}</span>
                    <span className="cfg-selo" data-tom={estado.tom}>
                      {estado.rotulo}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link href="/integracoes" className="cfg-link">
              Conectar em Integrações
            </Link>
          </div>
        </div>
      </section>

      {/* A tabela das credenciais, no desenho da tabela do DevMode. */}
      <section className="cfg-secao" aria-labelledby="cfg-credenciais">
        <h2 id="cfg-credenciais">Credenciais dos serviços</h2>
        <p className="cfg-secao-nota">
          Presença das variáveis de ambiente que o código lê.{" "}
          <span>“Presente” ainda não valida a conexão.</span>
        </p>
        {GRUPOS.map((grupo) => {
          const doGrupo = servicos.filter((s) => s.grupo === grupo.id);
          if (doGrupo.length === 0) return null;
          return (
            <div key={grupo.id} className="cfg-tabela">
              <table>
                <caption>{grupo.rotulo}</caption>
                <thead>
                  <tr>
                    <th scope="col">Serviço</th>
                    <th scope="col">Variáveis</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {doGrupo.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="cfg-servico">
                          <span
                            className="cfg-avatar"
                            data-cor={s.cor}
                            aria-hidden="true"
                          >
                            {ICONE[s.id] ?? <KeyRound />}
                          </span>
                          <div>
                            <b>{s.nome}</b>
                            <small>
                              {s.descricao} · {s.usadoEm}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="cfg-chips">
                          {s.variaveis.map((v) => (
                            <code key={v.nome} data-presente={v.presente}>
                              {v.nome}
                              {v.opcional ? " *" : ""}
                            </code>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span
                          className="cfg-selo"
                          data-tom={s.configurado ? "sucesso" : "neutro"}
                        >
                          {s.configurado ? (
                            <CheckCircle2 aria-hidden="true" />
                          ) : (
                            <XCircle aria-hidden="true" />
                          )}
                          {s.configurado ? "Presente" : "Faltando"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="cfg-rodape">
          * opcional. As variáveis são definidas na Vercel (Settings →
          Environment Variables) e valem no próximo deploy.
        </p>
      </section>

      {/* Zona de perigo: só o que é reversível de verdade. */}
      <section className="cfg-secao" aria-labelledby="cfg-locais">
        <h2 id="cfg-locais">Dados locais</h2>
        <CartaoDosDadosLocais />
      </section>
    </div>
  );
}
