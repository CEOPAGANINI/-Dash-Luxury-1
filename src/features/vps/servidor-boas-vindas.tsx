import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Cpu,
  FileArchive,
  Globe2,
  HardDrive,
  Layers3,
  LockKeyhole,
  Monitor,
  Network,
  Plus,
  Server,
  ShieldCheck,
  Terminal,
} from "./vps-icons";
import { PreRequisitos } from "./pre-requisitos";
import type { EstadoDaTela } from "./vps-cliente";
import styles from "./servidor-nexus.module.css";

/** Useful first-run content, never a simulated connected server. */
export function ServidorBoasVindas() {
  return (
    <section className={styles.welcome} aria-labelledby="server-welcome-title">
      <div className={styles.welcomeInner}>
        <div className={styles.welcomeCopy}>
          <span className={styles.eyebrow}>
            <Terminal size={14} aria-hidden /> Configuração inicial
          </span>
          <h3 id="server-welcome-title">
            Sua infraestrutura. <br />
            Sob seu controle.
          </h3>
          <p>
            Nenhum servidor conectado ainda. Conecte sua VPS para acompanhar os
            recursos e publicar as páginas do seu funil.
          </p>
          <Link href="/servidor/novo" className={styles.primaryLink}>
            <Plus size={17} aria-hidden />
            <span>Adicionar servidor</span>
            <ArrowRight size={17} aria-hidden />
          </Link>
          <span className={styles.securityNote}>
            <ShieldCheck aria-hidden size={15} /> Sua senha da VPS não fica no
            dashboard.
          </span>
        </div>
        <div
          className={styles.connectionMap}
          aria-label="Como a conexão funciona"
        >
          <div className={styles.mapHeading}>
            <span>Fluxo de conexão</span>
            <Network size={16} aria-hidden />
          </div>
          <div className={styles.mapNode}>
            <Monitor aria-hidden />
            <div>
              <strong>Seu dashboard</strong>
              <span>Você configura e acompanha</span>
            </div>
            <span className={styles.nodeIndex}>01</span>
          </div>
          <div className={styles.mapConnector}>
            <span />
            HTTPS · tarefas assinadas
          </div>
          <div className={`${styles.mapNode} ${styles.mapNodeEmphasis}`}>
            <Server aria-hidden />
            <div>
              <strong>Sua VPS</strong>
              <span>O agente executa as tarefas</span>
            </div>
            <span className={styles.nodeIndex}>02</span>
          </div>
          <div className={styles.mapConnector}>
            <span />
            Nginx · arquivos estáticos
          </div>
          <div className={styles.mapNode}>
            <Globe2 aria-hidden />
            <div>
              <strong>Seus sites</strong>
              <span>Domínio, HTTPS e versões</span>
            </div>
            <span className={styles.nodeIndex}>03</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ServidorResumo({ estado }: { estado: EstadoDaTela }) {
  const online = estado.servidores.filter(
    (s) => s.estado === "ativo" && s.sinal.tipo === "online",
  ).length;
  const itens = [
    {
      nome: "Servidores cadastrados",
      valor: estado.servidores.length,
      nota: "Sua infraestrutura",
      icon: Server,
    },
    {
      nome: "Servidores online",
      valor: online,
      nota: "Último sinal do agente",
      icon: Network,
    },
    {
      nome: "Sites cadastrados",
      valor: estado.sites.length,
      nota: "Páginas e domínios",
      icon: Globe2,
    },
  ];
  return (
    <div className={styles.overview}>
      {itens.map(({ nome, valor, nota, icon: Icon }) => (
        <div key={nome}>
          <dl className={styles.metricInner}>
            <dt>
              <Icon aria-hidden size={17} />
              {nome}
            </dt>
            <dd>
              {valor}
              <span>{nota}</span>
            </dd>
          </dl>
        </div>
      ))}
    </div>
  );
}

export function ServidorRecursos() {
  return (
    <aside
      className={styles.resources}
      aria-labelledby="server-resources-title"
    >
      <div className={styles.materialInner}>
        <div className={styles.sectionHeading}>
          <h3 id="server-resources-title">Seu ambiente de publicação</h3>
          <Layers3 aria-hidden size={18} />
        </div>
        <Link href="/servidor/sites" className={styles.resourceLink}>
          <FileArchive aria-hidden />
          <div>
            <strong>Sites e arquivos</strong>
            <span>Envie seu ZIP e acompanhe cada versão.</span>
          </div>
          <ArrowUpRight aria-hidden size={17} />
        </Link>
        <Link href="/servidor/sites" className={styles.resourceLink}>
          <Globe2 aria-hidden />
          <div>
            <strong>Domínios e HTTPS</strong>
            <span>Configure o endereço e o certificado do site.</span>
          </div>
          <ArrowUpRight aria-hidden size={17} />
        </Link>
        <Link href="/editor/landing-page" className={styles.resourceLink}>
          <Box aria-hidden />
          <div>
            <strong>Editor do funil</strong>
            <span>Prepare sua landing, upsell e obrigado.</span>
          </div>
          <ArrowUpRight aria-hidden size={17} />
        </Link>
        <div className={styles.monitoringNote}>
          <div>
            <Cpu aria-hidden size={17} />
            <HardDrive aria-hidden size={17} />
            <Network aria-hidden size={17} />
          </div>
          <strong>Acompanhe sua VPS de verdade</strong>
          <p>
            CPU, memória, disco e tempo de atividade aparecem após a conexão.
            Sem servidor, não há métricas para exibir.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function ServidorPreparacao({ estado }: { estado?: EstadoDaTela }) {
  return (
    <div className={styles.preparation} id="preparar-vps">
      <section
        className={styles.requirements}
        aria-labelledby="server-requirements-title"
      >
        <div className={styles.materialInner}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>Antes de conectar</span>
              <h3 id="server-requirements-title">Deixe sua VPS pronta</h3>
            </div>
            <Terminal aria-hidden size={20} />
          </div>
          <div className={styles.requirementRows}>
            <div>
              <Server aria-hidden size={18} />
              <div>
                <strong>Sistema compatível</strong>
                <p>
                  Ubuntu 22.04 / 24.04 ou Debian 12 / 13. Use uma VPS limpa, sem
                  aaPanel, cPanel, Plesk ou Apache, e pelo menos 1 GB livre em
                  /var.
                </p>
              </div>
            </div>
            <div>
              <Network aria-hidden size={18} />
              <div>
                <strong>Acesso e rede</strong>
                <p>
                  Console com root ou sudo, portas 80 e 443 liberadas no
                  provedor e relógio sincronizado.
                </p>
              </div>
            </div>
            <div>
              <FileArchive aria-hidden size={18} />
              <div>
                <strong>Seu site em ZIP</strong>
                <p>
                  Até 3 MB, com index.html na raiz, CSS, JavaScript e imagens.
                  Sem PHP e sem .htaccess.
                </p>
              </div>
            </div>
          </div>
          <div className={styles.requirementFooter}>
            <LockKeyhole size={15} aria-hidden />
            <span>
              Você confirma a identidade do servidor antes de liberar as
              tarefas.
            </span>
          </div>
        </div>
      </section>
      {estado && estado.pendencias.length > 0 && (
        <details
          className={styles.configuration}
          open={estado.pendencias.some((p) => !p.ok)}
        >
          <summary>
            <span>
              <Check size={16} aria-hidden />
              Configuração do dashboard
            </span>
            <span>
              {estado.pendencias.filter((p) => p.ok).length}/
              {estado.pendencias.length} itens prontos
            </span>
          </summary>
          <PreRequisitos pendencias={estado.pendencias} />
        </details>
      )}
    </div>
  );
}
