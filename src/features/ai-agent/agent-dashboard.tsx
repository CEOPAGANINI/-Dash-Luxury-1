"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ArrowUpRight,
  Send,
  Settings2,
  History,
  Sparkles,
  ShieldCheck,
  FileText,
  Download,
  Activity,
  Plug,
  LoaderCircle,
} from "lucide-react";
import { agentDemoAnswer, agentDemoSnapshot } from "./demo";
import {
  DEFAULT_AGENT_SETTINGS,
  redactSecrets,
  type AgentRun,
  type AgentSettings,
  type AiTask,
} from "./model";
import styles from "./agent-dashboard.module.css";

export type AgentView = "chat" | "drafts" | "history" | "settings";
const tasks: {
  id: AiTask;
  label: string;
  prompt: string;
  description: string;
}[] = [
  {
    id: "analysis",
    label: "Analisar tráfego",
    description: "BMs, investimento, CPA e ROAS",
    prompt: "Analise o tráfego e mostre o que merece minha atenção.",
  },
  {
    id: "campaign",
    label: "Planejar campanha",
    description: "Objetivo, públicos e orçamento",
    prompt: "Crie um rascunho de campanha de vendas e um plano de teste.",
  },
  {
    id: "creative",
    label: "Criar roteiro",
    description: "Textos, vídeos e carrosséis",
    prompt:
      "Sugira três conceitos de criativos sem inventar ofertas ou promessas.",
  },
  {
    id: "infrastructure",
    label: "Revisar infraestrutura",
    description: "Domínios, serviços e mensuração",
    prompt:
      "Liste as verificações de infraestrutura e rastreamento que preciso fazer.",
  },
];
const views: { id: AgentView; label: string; href: string }[] = [
  { id: "chat", label: "Assistente", href: "/agente-ia" },
  { id: "drafts", label: "Rascunhos", href: "/agente-ia/rascunhos" },
  { id: "history", label: "Histórico", href: "/agente-ia/historico" },
  { id: "settings", label: "Configurações", href: "/agente-ia/configuracoes" },
];
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  const body = await res.json();
  if (!res.ok)
    throw new Error(body.error ?? "Não foi possível concluir a solicitação.");
  return body as T;
}
function downloadRun(run: AgentRun) {
  const blob = new Blob(
    [
      `# ${tasks.find((t) => t.id === run.task)?.label}\n\nModo: ${run.mode === "demo" ? "DEMONSTRAÇÃO — dados fictícios" : "Consulta de IA com snapshot real"}\nProvedor: ${run.provider}\nModelo: ${run.model}\nData: ${run.createdAt}\n\n## Solicitação\n${run.prompt}\n\n## Resposta\n${run.answer}\n`,
    ],
    { type: "text/markdown;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agente-${run.task}-${run.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
export function AgentDashboard() {
  const pathname = usePathname();
  const initialView = views.find((v) => v.href === pathname)?.id ?? "chat";
  const [mode, setMode] = useState<"demo" | "real">("demo");
  const [storeIndex, setStoreIndex] = useState(0);
  const [task, setTask] = useState<AiTask>(
    initialView === "drafts" ? "campaign" : "analysis",
  );
  const [prompt, setPrompt] = useState("");
  const [demoRuns, setDemoRuns] = useState<AgentRun[]>([]);
  const [realRuns, setRealRuns] = useState<AgentRun[]>([]);
  const [settings, setSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [demoSettings, setDemoSettings] = useState<AgentSettings>({
    ...DEFAULT_AGENT_SETTINGS,
    model: "modelo de exemplo",
  });
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sending = useRef(false);
  const snapshot = agentDemoSnapshot(storeIndex);
  const activeSettings = mode === "demo" ? demoSettings : settings;
  const runs = mode === "demo" ? demoRuns : realRuns;
  const currentRuns = runs.slice().reverse();

  useEffect(() => {
    if (mode !== "real") return;
    let ignore = false;
    Promise.all([
      api<{
        settings: AgentSettings;
        configured: boolean;
        canConfigure: boolean;
      }>("/api/ia-agent/settings"),
      api<{ runs: AgentRun[] }>("/api/ia-agent"),
    ])
      .then(([config, history]) => {
        if (ignore) return;
        setSettings(config.settings);
        setConfigured(config.configured);
        setCanConfigure(config.canConfigure);
        setRealRuns(history.runs);
      })
      .catch((e) => {
        if (!ignore)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar o agente.",
          );
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [mode]);

  function changeMode(next: "demo" | "real") {
    if (next === mode || busy) return;
    setMode(next);
    setError("");
    setNotice("");
    setApiKey("");
    setPrompt("");
    setLoading(next === "real");
  }
  function updateSettings(patch: Partial<AgentSettings>) {
    if (mode === "demo") setDemoSettings((s) => ({ ...s, ...patch }));
    else setSettings((s) => ({ ...s, ...patch }));
    setNotice("");
  }
  async function send(text = prompt) {
    if (!text.trim() || sending.current || loading) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let run: AgentRun;
      if (mode === "demo") {
        run = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          task,
          prompt: redactSecrets(text),
          answer: agentDemoAnswer(task, storeIndex, redactSecrets(text)),
          mode,
          provider: "Simulador local",
          model: "Respostas demonstrativas por tarefa",
          totalTokens: null,
        };
        setDemoRuns((r) => [run, ...r].slice(0, 20));
      } else {
        const history = currentRuns.slice(-4).flatMap((r) => [
          { role: "user", content: r.prompt },
          { role: "assistant", content: r.answer.slice(0, 6000) },
        ]);
        const result = await api<{ run: AgentRun }>("/api/ia-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, prompt: text, history }),
        });
        run = result.run;
        setRealRuns((r) => [run, ...r].slice(0, 20));
      }
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar o agente.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function saveSettings() {
    setError("");
    setNotice("");
    if (mode === "demo") {
      setNotice(
        "Preferências demonstrativas atualizadas nesta tela. Não conectam um provedor nem alteram serviços reais.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ configured: boolean; settings: AgentSettings }>(
        "/api/ia-agent/settings",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings, apiKey }),
        },
      );
      setConfigured(r.configured);
      setSettings(r.settings);
      setApiKey("");
      setNotice(
        "Configuração salva. A próxima consulta real validará a chave e o modelo no provedor.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/ia-agent/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setConfigured(false);
      setApiKey("");
      setSettings(DEFAULT_AGENT_SETTINGS);
      setNotice("Chave do agente removida. O histórico continua disponível.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }
  const canEdit = mode === "demo" || canConfigure;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <Bot size={15} /> INTELIGÊNCIA DA OPERAÇÃO
          </p>
          <h1>Agente IA</h1>
          <p>Entenda o tráfego. Prepare campanhas. Revise sua operação.</p>
        </div>
        <Link href="/campanhas/quadro" className={styles.link}>
          Abrir quadro do funil <ArrowUpRight size={15} />
        </Link>
      </header>
      <nav aria-label="Área do agente" className={styles.tabs}>
        {views.map((v) => (
          <Link
            key={v.id}
            href={v.href}
            aria-current={initialView === v.id ? "page" : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <section className={styles.modeBar} aria-label="Modo do agente">
        <div className={styles.modeButtons}>
          <button
            type="button"
            disabled={busy}
            aria-pressed={mode === "demo"}
            onClick={() => changeMode("demo")}
          >
            Demonstração
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={mode === "real"}
            onClick={() => changeMode("real")}
          >
            IA conectada
          </button>
        </div>
        <span>
          {mode === "demo"
            ? "Simulador local • sem conexão • sem consumo de API"
            : loading
              ? "Carregando configuração…"
              : configured
                ? "Provedor configurado • validação na próxima consulta"
                : "Provedor ainda não configurado"}
        </span>
      </section>
      {mode === "demo" ? (
        <div className={styles.banner}>
          <Sparkles size={19} />
          <p>
            <strong>Tudo aqui é demonstração.</strong> Métricas fictícias e
            respostas de exemplo para explorar o funcionamento. As preferências
            do simulador são ilustrativas; ficam nesta tela.
          </p>
        </div>
      ) : (
        <div className={styles.banner}>
          <ShieldCheck size={19} />
          <p>
            <strong>Análises e rascunhos para revisão.</strong> Ao enviar, sua
            solicitação e o contexto habilitado vão ao provedor escolhido. O
            agente não publica anúncios nem modifica infraestrutura.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}

      {initialView === "settings" ? (
        <section
          className={styles.settings}
          aria-label="Configurações do agente"
        >
          <div className={styles.sectionTitle}>
            <Settings2 size={20} />
            <div>
              <h2>Provedor e limites</h2>
              <p>
                {mode === "demo"
                  ? "Experimente os campos. Para conectar de verdade, selecione IA conectada."
                  : "Chave criptografada no servidor. Só proprietário e administrador podem configurar."}
              </p>
            </div>
          </div>
          <form
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSettings();
            }}
          >
            <fieldset
              disabled={!canEdit || busy || loading}
              className={styles.fields}
            >
              <label>
                Provedor
                <select
                  value={activeSettings.provider}
                  onChange={(e) => {
                    updateSettings({
                      provider: e.target.value as AgentSettings["provider"],
                    });
                    setApiKey("");
                  }}
                >
                  <option value="groq">Groq</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude / Anthropic</option>
                </select>
              </label>
              <label>
                ID do modelo
                <input
                  required
                  name="agent-model-id"
                  autoComplete="off"
                  maxLength={120}
                  value={activeSettings.model}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                  placeholder="ID exato de um modelo disponível na sua conta"
                />
                <small>Confirme o modelo no painel do provedor.</small>
              </label>
              <label>
                Máximo de tokens por resposta
                <input
                  type="number"
                  min={256}
                  max={4000}
                  required
                  value={activeSettings.maxTokens}
                  onChange={(e) =>
                    updateSettings({ maxTokens: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Consultas por dia na operação
                <input
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={activeSettings.dailyRequests}
                  onChange={(e) =>
                    updateSettings({ dailyRequests: Number(e.target.value) })
                  }
                />
                <small>
                  Reinicia à meia-noite UTC. Tentativas com erro também contam.
                </small>
              </label>
              {mode === "real" && (
                <label className={styles.wide}>
                  Chave de API
                  <input
                    type="password"
                    value={apiKey}
                    name="agent-provider-api-key"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    maxLength={500}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      configured
                        ? "Deixe vazio para manter a chave do mesmo provedor"
                        : "Cole a chave do provedor"
                    }
                  />
                  <small>
                    A chave salva nunca é exibida ou devolvida pelo servidor.
                  </small>
                </label>
              )}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={activeSettings.includeCampaigns}
                  onChange={(e) =>
                    updateSettings({ includeCampaigns: e.target.checked })
                  }
                />{" "}
                Incluir snapshot das campanhas da operação
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={activeSettings.includeInfrastructure}
                  onChange={(e) =>
                    updateSettings({ includeInfrastructure: e.target.checked })
                  }
                />{" "}
                Incluir cadastro de domínios
              </label>
            </fieldset>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={!canEdit || busy || loading}
              >
                {busy
                  ? "Salvando…"
                  : mode === "demo"
                    ? "Aplicar na demonstração"
                    : "Salvar configuração"}
              </button>
              {mode === "real" && configured && canConfigure && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  Remover chave do agente
                </button>
              )}
            </div>
          </form>
          <div className={styles.rules}>
            <h3>Como o agente acessa os dados</h3>
            <p>
              O contexto real contém até 20 campanhas sincronizadas e 20
              domínios da operação atual, conforme os campos habilitados. As
              campanhas ainda não têm vínculo comprovado com uma loja
              específica. Sem dados, o agente recebe um contexto vazio.
            </p>
            <p>
              Consultas reais ficam no histórico do usuário, com conteúdo
              criptografado. O simulador usa a mesma base fictícia do bloco
              Facebook Ads; seu histórico fica apenas enquanto esta tela estiver
              aberta.
            </p>
          </div>
          <ServiceLinks />
        </section>
      ) : initialView === "history" ? (
        <section className={styles.history}>
          <div className={styles.sectionTitle}>
            <History size={20} />
            <div>
              <h2>Histórico de consultas</h2>
              <p>
                {mode === "demo"
                  ? "Exemplos desta sessão; não são gravados na sua operação."
                  : "Suas últimas 20 consultas concluídas na operação atual."}
              </p>
            </div>
          </div>
          {runs.length ? (
            runs.map((run) => <RunCard key={run.id} run={run} />)
          ) : (
            <div className={styles.empty}>
              <History size={30} />
              <h3>Nenhuma consulta neste modo</h3>
              <p>
                Use o assistente para gerar sua primeira análise ou rascunho.
              </p>
              <Link href="/agente-ia">
                Abrir assistente <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.context}>
            <p className={styles.eyebrow}>
              <Activity size={14} /> CONTEXTO DA ANÁLISE
            </p>
            {mode === "demo" ? (
              <>
                <label>
                  Loja de demonstração
                  <select
                    disabled={busy}
                    value={storeIndex}
                    onChange={(e) => {
                      setStoreIndex(Number(e.target.value));
                      setDemoRuns([]);
                      setNotice("");
                    }}
                  >
                    <option value={0}>Loja Suprema • 3 BMs</option>
                    <option value={1}>Loja Aurora • 2 BMs</option>
                  </select>
                </label>
                <div className={styles.metrics}>
                  <Metric
                    label="BMs / contas"
                    value={`${snapshot.businesses} / ${snapshot.accounts}`}
                  />
                  <Metric
                    label="Campanhas"
                    value={String(snapshot.campaigns)}
                  />
                  <Metric label="Investimento" value={money(snapshot.spend)} />
                  <Metric label="ROAS" value={`${snapshot.roas.toFixed(2)}x`} />
                  <Metric
                    label="Compras atribuídas"
                    value={String(snapshot.purchases)}
                  />
                  <Metric label="CPA" value={money(snapshot.cpa)} />
                </div>
                <p className={styles.muted}>
                  Últimos 7 dias fictícios. Receita atribuída não equivale a
                  lucro.
                </p>
              </>
            ) : (
              <>
                <h3>Operação atual</h3>
                <p className={styles.muted}>
                  Snapshot real consultado no servidor a cada envio. Sem seleção
                  de loja: as campanhas são da operação inteira.
                </p>
                <p className={styles.muted}>
                  Campanhas:{" "}
                  {settings.includeCampaigns
                    ? "contexto habilitado"
                    : "não incluídas"}
                  <br />
                  Domínios:{" "}
                  {settings.includeInfrastructure
                    ? "cadastro habilitado"
                    : "não incluídos"}
                </p>
                <Link href="/agente-ia/configuracoes">
                  Configurar IA <ArrowUpRight size={14} />
                </Link>
              </>
            )}
            <div className={styles.boundary}>
              <ShieldCheck size={18} />
              <h3>Você mantém o controle</h3>
              <p>
                Análises e sugestões. Publicação de campanhas e mudanças na
                infraestrutura seguem nos módulos existentes.
              </p>
            </div>
            <ServiceLinks />
          </aside>
          <section className={styles.chat} aria-label="Assistente da operação">
            <div className={styles.sectionTitle}>
              <Bot size={23} />
              <div>
                <h2>
                  {initialView === "drafts"
                    ? "Estúdio de rascunhos"
                    : "O que vamos analisar?"}
                </h2>
                <p>Escolha uma tarefa e descreva o que você precisa.</p>
              </div>
            </div>
            <div className={styles.taskGrid}>
              {tasks.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  disabled={busy}
                  aria-pressed={task === t.id}
                  onClick={() => {
                    setTask(t.id);
                    setPrompt(t.prompt);
                  }}
                >
                  <strong>{t.label}</strong>
                  <span>{t.description}</span>
                </button>
              ))}
            </div>
            <div
              className={styles.messages}
              aria-live="polite"
              aria-busy={busy}
            >
              {!runs.length && (
                <div className={styles.welcome}>
                  <Sparkles size={25} />
                  <h3>
                    {mode === "demo"
                      ? "Explore antes de conectar"
                      : "Seu assistente está pronto para receber uma tarefa"}
                  </h3>
                  <p>
                    {mode === "demo"
                      ? "Veja uma análise completa, um plano de campanha, roteiros de anúncios ou um checklist de infraestrutura com exemplos."
                      : "Configure o provedor, selecione o contexto e envie sua solicitação. Os resultados serão sugestões para sua revisão."}
                  </p>
                  <button
                    type="button"
                    disabled={
                      busy || loading || (mode === "real" && !configured)
                    }
                    onClick={() =>
                      void send(tasks.find((t) => t.id === task)!.prompt)
                    }
                  >
                    {mode === "demo"
                      ? "Gerar exemplo completo"
                      : "Executar tarefa selecionada"}{" "}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
              {currentRuns.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
              {busy && (
                <p className={styles.busy} role="status">
                  <LoaderCircle size={16} /> Preparando resposta…
                </p>
              )}
            </div>
            <form
              className={styles.composer}
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label htmlFor="agent-prompt" className="sr-only">
                Solicitação para o agente
              </label>
              <textarea
                id="agent-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="Descreva sua dúvida ou a campanha que quer preparar…"
                disabled={busy || loading}
              />
              <div>
                <span>
                  {prompt.length}/4.000 •{" "}
                  {mode === "demo"
                    ? "exemplo demonstrativo"
                    : "enviado ao provedor configurado"}
                </span>
                <button
                  className={styles.primary}
                  disabled={
                    busy ||
                    loading ||
                    !prompt.trim() ||
                    (mode === "real" && !configured)
                  }
                >
                  <Send size={15} />{" "}
                  {mode === "demo" ? "Simular resposta" : "Enviar à IA"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function RunCard({ run }: { run: AgentRun }) {
  return (
    <article className={styles.run}>
      <div className={styles.runHead}>
        <span>
          <FileText size={14} /> {tasks.find((t) => t.id === run.task)?.label} •{" "}
          {run.mode === "demo" ? "DEMONSTRAÇÃO" : "IA CONECTADA"}
        </span>
        <button
          type="button"
          aria-label={`Exportar ${tasks.find((t) => t.id === run.task)?.label}`}
          onClick={() => downloadRun(run)}
        >
          <Download size={14} /> Exportar
        </button>
      </div>
      <p className={styles.question}>
        <strong>Você:</strong> {run.prompt}
      </p>
      <p className={styles.answer}>{run.answer}</p>
      <p className={styles.meta}>
        {run.createdAt.slice(0, 19).replace("T", " ")} UTC • {run.provider} •{" "}
        {run.model}
        {run.totalTokens !== null ? ` • ${run.totalTokens} tokens` : ""}
      </p>
    </article>
  );
}
function ServiceLinks() {
  return (
    <div className={styles.services}>
      <p className={styles.eyebrow}>
        <Plug size={13} /> CONEXÕES DA OPERAÇÃO
      </p>
      <Link href="/integracoes">
        Conexões e APIs <ArrowUpRight size={13} />
      </Link>
      <Link href="/servidor/sites">
        Domínios e sites <ArrowUpRight size={13} />
      </Link>
      <Link href="/configuracoes/diagnosticos">
        Diagnóstico dos serviços <ArrowUpRight size={13} />
      </Link>
      <Link href="/roteador-de-ofertas">
        Roteador de ofertas <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
