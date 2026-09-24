"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import {
  configuracaoDoPainel,
  consumeVpsAttempt,
  emailDoCertbot,
  exigirDonoDaVps,
  type AcessoVps,
  type OpcoesDaGuarda,
} from "./acesso";
import {
  controlCharacters,
  R_UUID,
  VPS_INPUT_LIMITS,
  VpsError,
  type CodigoVps,
  type ResultadoVps,
} from "./modelo";
import {
  detalheDoErroPg,
  faltaTabelaVps,
  mensagemDeErroVps,
} from "./schema-sql";
import {
  alterarCheckout,
  alterarDominios,
  ativarVersao,
  auditar,
  checkoutPublicado,
  COMANDO_DESINSTALAR,
  COMANDO_DESINSTALAR_TUDO,
  confirmarServidor,
  conferirSite,
  criarServidor,
  criarSite,
  emitirSsl,
  forcarRemocaoSite,
  informarIp,
  lerAgora,
  novaInstalacao,
  reaplicarSite,
  removerServidor,
  removerSite,
  verificarDns,
  type CheckoutEscolhido,
  type EntradaDeAuditoria,
  type Instalacao,
  type NoAr,
} from "./servico";

/*
  As ações do Servidor do Funil (§6.4), no formato do useActionState:
  `(anterior, formData) => ResultadoVps`. Nunca lançam: todo erro volta
  como `{ ok: false, codigo, mensagem }` para a tela mostrar em
  role="alert".

  Ordem de cada uma: guarda (dono, login recente quando muda algo
  sensível), limite de 10 ações por minuto, validação dos campos (as
  mesmas regras de modelo.ts que a tela aplica antes de enviar), serviço
  (servico.ts, que recebe o `db`), revalidação das páginas e retorno. A
  auditoria roda depois da resposta (after) e nunca derruba a ação.

  O upload do ZIP NÃO é ação (o teto de corpo das actions é 1 MB): é
  POST /api/painel/vps/publicar.
*/

// ---------------------------------------------------------------------------
// Infra das ações
// ---------------------------------------------------------------------------

type Guarda = OpcoesDaGuarda & {
  /** Nome da ação no limite de 10 por minuto. */
  acao: string;
};

const FALHA_INTERNA =
  "Algo deu errado aqui no painel. Tente de novo; se continuar, veja os logs da Vercel.";

function resultadoDeErro(erro: unknown): ResultadoVps<never> {
  if (erro instanceof VpsError) {
    const { erros, ...resto } = (erro.extra ?? {}) as {
      erros?: Record<string, string>;
    } & Record<string, unknown>;
    return {
      ok: false,
      codigo: erro.codigo as CodigoVps,
      mensagem: erro.message,
      ...(erros ? { erros } : {}),
      ...(Object.keys(resto).length > 0 ? { dados: resto as never } : {}),
    };
  }
  if (faltaTabelaVps(erro)) {
    console.error("[vps] tabelas ausentes numa ação", erro);
    return {
      ok: false,
      codigo: "sem_tabelas",
      mensagem: mensagemDeErroVps(erro),
    };
  }
  if (detalheDoErroPg(erro).codigo) {
    console.error("[vps] o banco recusou uma ação", erro);
    return {
      ok: false,
      codigo: "erro_banco",
      mensagem: mensagemDeErroVps(erro),
    };
  }
  console.error("[vps] erro inesperado numa ação", erro);
  return { ok: false, codigo: "erro_interno", mensagem: FALHA_INTERNA };
}

/**
 * As páginas do Servidor. Os caminhos dinâmicos levam o grupo de rotas: as
 * tags implícitas vêm do ARQUIVO da página (revalidatePath.md). O layout
 * raiz não é revalidado.
 */
function revalidar(): void {
  revalidatePath("/servidor");
  revalidatePath("/servidor/sites");
  revalidatePath("/(painel)/servidor/[servidorId]", "page");
  revalidatePath("/(painel)/servidor/sites/[siteId]", "page");
}

async function executar<D>(
  guarda: Guarda,
  corpo: (acesso: AcessoVps & { por: string }) => Promise<ResultadoVps<D>>,
): Promise<ResultadoVps<D>> {
  try {
    const acesso = await exigirDonoDaVps(guarda);
    await consumeVpsAttempt(
      acesso.db,
      acesso.workspaceId,
      acesso.session.user.id,
      guarda.acao,
    );
    const por = acesso.session.user.email || acesso.session.user.id;
    const resultado = await corpo({ ...acesso, por });
    if (resultado.ok) revalidar();
    return resultado;
  } catch (erro) {
    return resultadoDeErro(erro);
  }
}

/** Auditoria depois da resposta (auditar nunca lança). */
function registrar(
  acesso: AcessoVps,
  entrada: Omit<EntradaDeAuditoria, "workspaceId">,
) {
  after(() =>
    auditar(acesso.db, { workspaceId: acesso.workspaceId, ...entrada }),
  );
}

/** Lê os campos (só texto) e aplica o zod; erro vira `erros` por campo. */
function lerCampos<T extends z.ZodType>(
  esquema: T,
  formData: FormData,
): z.infer<T> {
  const bruto: Record<string, string> = {};
  for (const [chave, valor] of formData.entries())
    if (typeof valor === "string" && !chave.startsWith("$"))
      bruto[chave] = valor;
  const lido = esquema.safeParse(bruto);
  if (lido.success) return lido.data;
  const erros: Record<string, string> = {};
  for (const problema of lido.error.issues) {
    const campo = String(problema.path[0] ?? "formulario");
    erros[campo] ??= problema.message;
  }
  throw new VpsError(400, "dados_invalidos", "Confira os campos destacados.", {
    erros,
  });
}

const campoId = (mensagem: string) => z.string().trim().regex(R_UUID, mensagem);
const campoServidor = campoId("Servidor inválido.");
const campoSite = campoId("Site inválido.");
const campoNome = z
  .string()
  .trim()
  .min(1, "Dê um nome.")
  .max(VPS_INPUT_LIMITS.name, `Até ${VPS_INPUT_LIMITS.name} caracteres.`)
  .refine((s) => !controlCharacters.test(s), "Sem caracteres de controle.");
const campoSimNao = z.enum(["sim", "nao"], { error: "Escolha sim ou não." });
const campoDominio = z
  .string()
  .trim()
  .min(1, "Digite o domínio, ex.: loja.com.br")
  .max(300, "Domínio longo demais.");
const campoCheckout = z
  .string()
  .trim()
  .refine((s) => s === "nenhum" || R_UUID.test(s), "Escolha um checkout.");
const campoConfirmacao = z.string().max(300).default("");

/** O checkout escolhido no BlockPicker ("nenhum" = sem /checkout configurado). */
async function lerCheckout(
  acesso: AcessoVps,
  checkoutId: string,
): Promise<CheckoutEscolhido> {
  return checkoutId === "nenhum"
    ? null
    : checkoutPublicado(acesso.db, acesso.workspaceId, checkoutId);
}

/** Sem BlockPicker de origem (uma só na lista), vale a primeira. */
function origemEscolhida(origem: string | undefined): {
  origem: string;
  origens: string[];
} {
  const { origens } = configuracaoDoPainel();
  return { origem: origem?.trim() || origens[0] || "", origens };
}

// ---------------------------------------------------------------------------
// Servidores
// ---------------------------------------------------------------------------

export async function criarServidorAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ servidorId: string; instalacao: Instalacao }>> {
  return executar(
    {
      alterar: true,
      recente: true,
      criarServidor: true,
      acao: "criar_servidor",
    },
    async (acesso) => {
      const { nome } = lerCampos(z.object({ nome: campoNome }), formData);
      const painel = configuracaoDoPainel().painel!;
      const { servidorId, instalacao } = await criarServidor(acesso.db, {
        workspaceId: acesso.workspaceId,
        nome,
        por: acesso.por,
        painel,
      });
      registrar(acesso, {
        acao: "servidor.criado",
        entidade: "vps_server",
        entidadeId: servidorId,
        por: acesso.por,
        campos: { nome, instalacaoExpiraEm: instalacao.expiraEm },
      });
      return {
        ok: true,
        mensagem:
          "Servidor criado. Cole o comando no console da VPS e aperte Enter.",
        dados: { servidorId, instalacao },
      };
    },
  );
}

export async function novaInstalacaoAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ instalacao: Instalacao }>> {
  return executar(
    {
      alterar: true,
      recente: true,
      criarServidor: true,
      acao: "nova_instalacao",
    },
    async (acesso) => {
      const { servidorId } = lerCampos(
        z.object({ servidorId: campoServidor }),
        formData,
      );
      const { instalacao } = await novaInstalacao(acesso.db, {
        workspaceId: acesso.workspaceId,
        servidorId,
        painel: configuracaoDoPainel().painel!,
      });
      registrar(acesso, {
        acao: "servidor.instalacao_gerada",
        entidade: "vps_server",
        entidadeId: servidorId,
        por: acesso.por,
        campos: { instalacaoExpiraEm: instalacao.expiraEm },
      });
      return {
        ok: true,
        mensagem:
          "Comando novo gerado. O agente atual continua valendo até o novo se registrar.",
        dados: { instalacao },
      };
    },
  );
}

export async function confirmarServidorAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ sitesReaplicados: number }>> {
  return executar(
    { alterar: true, acao: "confirmar_servidor" },
    async (acesso) => {
      const { servidorId, resposta } = lerCampos(
        z.object({ servidorId: campoServidor, resposta: campoSimNao }),
        formData,
      );
      const { sitesReaplicados } = await confirmarServidor(acesso.db, {
        workspaceId: acesso.workspaceId,
        servidorId,
        resposta,
        por: acesso.por,
      });
      registrar(acesso, {
        acao: resposta === "sim" ? "servidor.confirmado" : "servidor.recusado",
        entidade: "vps_server",
        entidadeId: servidorId,
        por: acesso.por,
        campos: resposta === "sim" ? { sitesReaplicados } : {},
      });
      return {
        ok: true,
        mensagem:
          resposta === "nao"
            ? "Acesso cortado. Gere um comando novo para instalar no servidor certo."
            : sitesReaplicados > 0
              ? `Servidor confirmado. ${sitesReaplicados} ${sitesReaplicados === 1 ? "site será reaplicado" : "sites serão reaplicados"} neste servidor.`
              : "Servidor confirmado.",
        dados: { sitesReaplicados },
      };
    },
  );
}

export async function informarIpAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ ip: string | null }>> {
  return executar({ alterar: true, acao: "informar_ip" }, async (acesso) => {
    const { servidorId, ip } = lerCampos(
      z.object({
        servidorId: campoServidor,
        ip: z.string().max(64).default(""),
      }),
      formData,
    );
    const feito = await informarIp(acesso.db, {
      workspaceId: acesso.workspaceId,
      servidorId,
      ip,
    });
    return {
      ok: true,
      mensagem: feito.ip
        ? `IP público gravado: ${feito.ip}.`
        : "IP informado apagado; vale o que o agente relata.",
      dados: feito,
    };
  });
}

export async function lerAgoraAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string }>> {
  return executar({ alterar: true, acao: "ler_agora" }, async (acesso) => {
    const { servidorId } = lerCampos(
      z.object({ servidorId: campoServidor }),
      formData,
    );
    const tarefa = await lerAgora(acesso.db, {
      workspaceId: acesso.workspaceId,
      servidorId,
      por: acesso.por,
    });
    return {
      ok: true,
      mensagem: tarefa.repetida
        ? "Já há uma leitura na fila deste servidor."
        : "Leitura pedida. O servidor busca em até 30 s.",
      dados: { tarefaId: tarefa.id },
    };
  });
}

export async function removerServidorAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<
  ResultadoVps<{
    desinstalar: string;
    desinstalarTudo: string;
    sitesRemovidos: number;
  }>
> {
  return executar(
    { alterar: true, recente: true, acao: "remover_servidor" },
    async (acesso) => {
      const { servidorId, confirmacao } = lerCampos(
        z.object({ servidorId: campoServidor, confirmacao: campoConfirmacao }),
        formData,
      );
      const feito = await removerServidor(acesso.db, {
        workspaceId: acesso.workspaceId,
        servidorId,
        confirmacao,
      });
      registrar(acesso, {
        acao: "servidor.removido",
        entidade: "vps_server",
        entidadeId: servidorId,
        por: acesso.por,
        campos: { nome: feito.nome, sitesRemovidos: feito.sitesRemovidos },
      });
      return {
        ok: true,
        mensagem:
          "Servidor removido do painel e acesso do agente cortado. A VPS continua servindo os sites até você desinstalar o agente nela.",
        dados: {
          desinstalar: COMANDO_DESINSTALAR,
          desinstalarTudo: COMANDO_DESINSTALAR_TUDO,
          sitesRemovidos: feito.sitesRemovidos,
        },
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export async function criarSiteAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ siteId: string; tarefaId: string }>> {
  return executar(
    { alterar: true, recente: true, acao: "criar_site" },
    async (acesso) => {
      const campos = lerCampos(
        z.object({
          servidorId: campoServidor,
          nome: campoNome,
          dominio: campoDominio,
          incluirWww: campoSimNao,
          checkoutId: campoCheckout,
          origemCheckout: z.string().max(300).optional(),
        }),
        formData,
      );
      const checkout = await lerCheckout(acesso, campos.checkoutId);
      const { origem, origens } = origemEscolhida(campos.origemCheckout);
      const { hostsReservados } = configuracaoDoPainel();
      const feito = await criarSite(acesso.db, {
        workspaceId: acesso.workspaceId,
        servidorId: campos.servidorId,
        nome: campos.nome,
        dominio: campos.dominio,
        incluirWww: campos.incluirWww === "sim",
        checkout,
        origemCheckout: origem,
        origens,
        hostsReservados,
        por: acesso.por,
      });
      registrar(acesso, {
        acao: "site.criado",
        entidade: "vps_site",
        entidadeId: feito.siteId,
        por: acesso.por,
        campos: {
          nome: campos.nome,
          slug: feito.slug,
          servidorId: campos.servidorId,
          checkoutId: checkout?.id ?? null,
        },
      });
      return {
        ok: true,
        mensagem:
          "Site criado. O servidor prepara a página de espera em até 30 s; enquanto isso, aponte o DNS.",
        dados: { siteId: feito.siteId, tarefaId: feito.tarefaId },
      };
    },
  );
}

export async function alterarDominiosAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string; dominios: string[] }>> {
  return executar(
    { alterar: true, recente: true, acao: "alterar_dominios" },
    async (acesso) => {
      const campos = lerCampos(
        z.object({
          siteId: campoSite,
          dominio: campoDominio,
          incluirWww: campoSimNao,
        }),
        formData,
      );
      const feito = await alterarDominios(acesso.db, {
        workspaceId: acesso.workspaceId,
        siteId: campos.siteId,
        dominio: campos.dominio,
        incluirWww: campos.incluirWww === "sim",
        hostsReservados: configuracaoDoPainel().hostsReservados,
        por: acesso.por,
      });
      registrar(acesso, {
        acao: "site.dominios_alterados",
        entidade: "vps_site",
        entidadeId: campos.siteId,
        por: acesso.por,
        campos: { dominios: feito.dominios },
      });
      return {
        ok: true,
        mensagem:
          "Domínios trocados. Aponte o DNS dos novos e verifique; o HTTPS é pedido de novo quando o DNS estiver certo.",
        dados: feito,
      };
    },
  );
}

export async function alterarCheckoutAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string; checkoutUrl: string | null }>> {
  return executar(
    { alterar: true, recente: true, acao: "alterar_checkout" },
    async (acesso) => {
      const campos = lerCampos(
        z.object({
          siteId: campoSite,
          checkoutId: campoCheckout,
          origemCheckout: z.string().max(300).optional(),
        }),
        formData,
      );
      const checkout = await lerCheckout(acesso, campos.checkoutId);
      const { origem, origens } = origemEscolhida(campos.origemCheckout);
      const feito = await alterarCheckout(acesso.db, {
        workspaceId: acesso.workspaceId,
        siteId: campos.siteId,
        checkout,
        origemCheckout: origem,
        origens,
        por: acesso.por,
      });
      registrar(acesso, {
        acao: "site.checkout_alterado",
        entidade: "vps_site",
        entidadeId: campos.siteId,
        por: acesso.por,
        campos: { checkoutUrl: feito.checkoutUrl, origem },
      });
      return {
        ok: true,
        mensagem: feito.checkoutUrl
          ? `O botão /checkout vai para ${feito.checkoutUrl} assim que o servidor aplicar.`
          : "O /checkout deste site ficou sem destino configurado.",
        dados: feito,
      };
    },
  );
}

export async function reaplicarSiteAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string }>> {
  return executar({ alterar: true, acao: "reaplicar_site" }, async (acesso) => {
    const { siteId } = lerCampos(z.object({ siteId: campoSite }), formData);
    const feito = await reaplicarSite(acesso.db, {
      workspaceId: acesso.workspaceId,
      siteId,
      por: acesso.por,
    });
    registrar(acesso, {
      acao: "site.reaplicado",
      entidade: "vps_site",
      entidadeId: siteId,
      por: acesso.por,
    });
    return {
      ok: true,
      mensagem:
        "Pedido enviado: o servidor refaz as pastas e o nginx deste site.",
      dados: feito,
    };
  });
}

export async function verificarDnsAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<
  ResultadoVps<{
    dominios: Array<{
      hostname: string;
      status: string;
      mensagem: string | null;
    }>;
    httpsPedido: boolean;
  }>
> {
  return executar({ alterar: true, acao: "verificar_dns" }, async (acesso) => {
    const { siteId } = lerCampos(z.object({ siteId: campoSite }), formData);
    const feito = await verificarDns(acesso.db, {
      workspaceId: acesso.workspaceId,
      siteId,
      email: emailDoCertbot(acesso.session),
      por: acesso.por,
    });
    if (feito.httpsPedido)
      registrar(acesso, {
        acao: "site.ssl_solicitado",
        entidade: "vps_site",
        entidadeId: siteId,
        por: acesso.por,
        campos: { automatico: true },
      });
    const certos = feito.dominios.filter((d) => d.status === "ok").length;
    return {
      ok: true,
      mensagem: feito.httpsPedido
        ? "DNS certo em todos os domínios. O HTTPS foi pedido ao servidor."
        : `DNS certo em ${certos} de ${feito.dominios.length} ${feito.dominios.length === 1 ? "domínio" : "domínios"} na última verificação.`,
      dados: feito,
    };
  });
}

export async function emitirSslAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string }>> {
  return executar({ alterar: true, acao: "emitir_ssl" }, async (acesso) => {
    const { siteId } = lerCampos(z.object({ siteId: campoSite }), formData);
    const feito = await emitirSsl(acesso.db, {
      workspaceId: acesso.workspaceId,
      siteId,
      email: emailDoCertbot(acesso.session),
      por: acesso.por,
    });
    registrar(acesso, {
      acao: "site.ssl_solicitado",
      entidade: "vps_site",
      entidadeId: siteId,
      por: acesso.por,
      campos: { automatico: false },
    });
    return {
      ok: true,
      mensagem: "HTTPS pedido. O servidor busca o pedido em até 30 s.",
      dados: feito,
    };
  });
}

export async function ativarVersaoAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string; siteId: string }>> {
  return executar(
    { alterar: true, recente: true, acao: "ativar_versao" },
    async (acesso) => {
      const { versaoId } = lerCampos(
        z.object({ versaoId: campoId("Versão inválida.") }),
        formData,
      );
      const feito = await ativarVersao(acesso.db, {
        workspaceId: acesso.workspaceId,
        versaoId,
        por: acesso.por,
      });
      return {
        ok: true,
        mensagem:
          "Pedido enviado: o servidor volta para esta versão usando a cópia guardada nele.",
        dados: feito,
      };
    },
  );
}

export async function conferirPublicoAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ noAr: NoAr }>> {
  return executar(
    { alterar: true, acao: "conferir_publico" },
    async (acesso) => {
      const { siteId } = lerCampos(z.object({ siteId: campoSite }), formData);
      const noAr = await conferirSite(acesso.db, {
        workspaceId: acesso.workspaceId,
        siteId,
      });
      return {
        ok: true,
        mensagem:
          noAr.estado === "ok"
            ? "Conferido: o domínio mostra a versão ativa."
            : noAr.estado === "pagina_de_espera"
              ? "Conferido: o domínio mostra a página de espera."
              : noAr.estado === "outra_coisa"
                ? "Conferido: o domínio responde outra coisa (DNS, CDN ou cache?)."
                : `A conferência falhou: ${noAr.detalhe ?? "sem detalhe"}`,
        dados: { noAr },
      };
    },
  );
}

export async function removerSiteAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ tarefaId: string }>> {
  return executar(
    { alterar: true, recente: true, acao: "remover_site" },
    async (acesso) => {
      const { siteId, confirmacao } = lerCampos(
        z.object({ siteId: campoSite, confirmacao: campoConfirmacao }),
        formData,
      );
      const feito = await removerSite(acesso.db, {
        workspaceId: acesso.workspaceId,
        siteId,
        confirmacao,
        por: acesso.por,
      });
      return {
        ok: true,
        mensagem:
          "Remoção pedida. O servidor tira o site do nginx, apaga o certificado e guarda a pasta por 7 dias.",
        dados: feito,
      };
    },
  );
}

export async function forcarRemocaoSiteAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps<{ siteId: string }>> {
  return executar(
    { alterar: true, recente: true, acao: "forcar_remocao_site" },
    async (acesso) => {
      const { siteId, confirmacao } = lerCampos(
        z.object({ siteId: campoSite, confirmacao: campoConfirmacao }),
        formData,
      );
      const feito = await forcarRemocaoSite(acesso.db, {
        workspaceId: acesso.workspaceId,
        siteId,
        confirmacao,
      });
      registrar(acesso, {
        acao: "site.remocao_forcada",
        entidade: "vps_site",
        entidadeId: siteId,
        por: acesso.por,
      });
      return {
        ok: true,
        mensagem:
          "Site tirado do painel sem a resposta do servidor. A VPS pode continuar servindo este site.",
        dados: feito,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Login recente
// ---------------------------------------------------------------------------

/** Destinos aceitos na volta do login (só as telas do Servidor). */
const DESTINO_DO_SERVIDOR = /^\/servidor(?:\/[A-Za-z0-9_-]+)*$/;

/**
 * Atende o `login_antigo`: encerra a sessão e leva ao login, que devolve
 * para a tela do Servidor de onde a pessoa veio. O login novo renova o
 * `amr` da sessão.
 */
export async function reentrarAction(
  _anterior: ResultadoVps | null,
  formData: FormData,
): Promise<ResultadoVps> {
  const bruto = formData.get("destino");
  const destino =
    typeof bruto === "string" && DESTINO_DO_SERVIDOR.test(bruto)
      ? bruto
      : "/servidor";
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch (erro) {
      console.error("[vps] não foi possível encerrar a sessão", erro);
    }
  }
  redirect(`/login?redirect=${encodeURIComponent(destino)}`);
}
