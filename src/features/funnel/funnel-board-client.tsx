"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { FunnelBoard } from "./funnel-board";
import { FUNIL_DEMO } from "./funnel-demo";
import type { FunnelData, FunnelNodeType } from "./funnel-model";
import { criarCofreFunil } from "./funil-store";
import { validarFunnelData } from "./funnel-validation";
import { connectFunnelCloud, type FunnelSyncStatus } from "./cloud-client";
import { restorePackages } from "./package-cloud";
import { funnelScopeId } from "./editor-identity";
import { packageReferenceIds } from "./package-references";
import { preservePackageReferences } from "./package-references";
import { mergeFunnelEnvelopes } from "./cloud-contract";

/**
 * Casca client do quadro: autosave local e sincronização privada com controle
 * de revisão. Uma falha de rede preserva o rascunho e mostra feedback.
 */
interface FunnelBoardClientProps {
  storageId: string;
  workspaceId?: string;
  inicial?: FunnelData;
  /** Abre, ao montar, o primeiro bloco deste tipo (ex.: "redirect"). */
  focoTipo?: FunnelNodeType;
  initialPanel?: "recursos" | "funis" | "lista";
}

export function FunnelBoardClient(props: FunnelBoardClientProps) {
  const scopeId = funnelScopeId(props.storageId, props.workspaceId);
  return (
    <FunnelBoardSession
      key={scopeId}
      {...props}
      storageId={scopeId}
      legacyUserId={props.workspaceId ? props.storageId : undefined}
    />
  );
}

function FunnelBoardSession({
  storageId,
  inicial,
  focoTipo,
  initialPanel,
  legacyUserId,
}: FunnelBoardClientProps & { legacyUserId?: string }) {
  const router = useRouter();
  const cofre = React.useMemo(() => criarCofreFunil(storageId), [storageId]);
  const [pronto, setPronto] = React.useState(false);
  const [dados, setDados] = React.useState<FunnelData>(inicial ?? FUNIL_DEMO);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [legado, setLegado] = React.useState(false);
  const [legacyAccount, setLegacyAccount] = React.useState(false);
  // Nonce de remontagem: garante que um "reset" para um funil de mesmo id
  // (ex.: Excluir → volta ao demo) recrie o board em vez de manter o state.
  const [resetSeq, setResetSeq] = React.useState(0);
  const [syncStatus, setSyncStatus] = React.useState<FunnelSyncStatus>(() =>
    storageId === "demo-user"
      ? {
          state: "local",
          message: "Demonstração · alterações somente neste navegador",
        }
      : { state: "loading", message: "Conferindo a versão da sua conta…" },
  );
  const sync = React.useRef<ReturnType<typeof connectFunnelCloud> | null>(null);
  const openLoadedDraft = React.useCallback(
    (draft: FunnelData) => {
      if (
        focoTipo === "store" &&
        inicial &&
        !draft.nodes.some((node) => node.type === "store")
      ) {
        // The store route must be an actual store editor without destroying the
        // user's previous landing funnel, even when it was only a draft.
        cofre.salvarFunil(draft);
        cofre.salvarRascunho(inicial);
        setDados(inicial);
        setAviso(
          "Seu funil anterior foi preservado em Meus funis. A estrutura da loja está pronta para editar e importar seus arquivos.",
        );
      } else setDados(draft);
    },
    [cofre, focoTipo, inicial],
  );

  // Lê o funil salvo depois de montar, evitando divergência de hidratação.
  React.useEffect(() => {
    try {
      const rascunho = cofre.lerRascunho();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- o rascunho só existe no navegador
      if (rascunho) openLoadedDraft(rascunho);
      setLegado(cofre.legadoDisponivel());
      if (legacyUserId) {
        const old = criarCofreFunil(legacyUserId).exportarEnvelope();
        setLegacyAccount(Boolean(old.rascunho || old.funis.length));
      }
    } catch (error) {
      setAviso(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir seus funis. Nenhum dado foi alterado.",
      );
    }
    setPronto(true);
    const alterado = (event: StorageEvent) => {
      if (
        event.storageArea === window.localStorage &&
        (event.key === cofre.chave || event.key === null)
      ) {
        setAviso(
          "Outra aba alterou os funis desta conta. Exporte suas alterações antes de recarregar; o salvamento antigo não será sobrescrito.",
        );
      }
    };
    window.addEventListener("storage", alterado);
    return () => window.removeEventListener("storage", alterado);
  }, [cofre, legacyUserId, openLoadedDraft]);

  React.useEffect(() => {
    if (!pronto) return;
    if (storageId === "demo-user") return;
    sync.current = connectFunnelCloud(storageId, cofre, setSyncStatus, () => {
      const rascunho = cofre.lerRascunho();
      if (rascunho) {
        openLoadedDraft(rascunho);
        setResetSeq((n) => n + 1);
      }
    });
    return () => {
      sync.current?.stop();
      sync.current = null;
    };
  }, [cofre, pronto, storageId, openLoadedDraft]);

  const salvar = React.useCallback(
    (data: FunnelData) => {
      cofre.salvarRascunho(data);
      setDados(data);
    },
    [cofre],
  );

  const cloudLoaded = syncStatus.state !== "loading";
  const references = React.useMemo(
    () => packageReferenceIds(dados).join("\n"),
    [dados],
  );
  React.useEffect(() => {
    if (!pronto || !cloudLoaded) return;
    let active = true;
    void restorePackages(
      storageId,
      dados.id,
      references ? references.split("\n") : [],
    ).catch((error) => {
      if (active)
        setAviso(
          error instanceof Error
            ? error.message
            : "Não foi possível recuperar os ZIPs.",
        );
    });
    return () => {
      active = false;
    };
  }, [pronto, storageId, dados.id, cloudLoaded, references]);

  const importarLegado = () => {
    const confirmado = window.confirm(
      "Os dados antigos não têm dono identificado e podem pertencer a outra pessoa que usou este navegador. Confirma que pertencem a você e deseja copiar para o cofre desta conta? Os originais serão preservados.",
    );
    if (!confirmado) return;
    try {
      const quantidade = cofre.importarLegado(true);
      setLegado(false);
      setAviso(
        `${quantidade} registro(s) copiado(s) para Meus funis nesta conta. Os dados antigos foram preservados.`,
      );
    } catch (error) {
      setAviso(
        error instanceof Error
          ? error.message
          : "Importação não realizada. Os originais foram preservados.",
      );
    }
  };

  if (!pronto) {
    return (
      <div className="funnel" aria-busy="true">
        <div role="status" className="border bg-card p-5 text-sm">
          Abrindo seu quadro do funil…
        </div>
      </div>
    );
  }

  return (
    <div className="funnel-session">
      {(aviso || legado || legacyAccount) && (
        <div
          style={{
            position: "absolute",
            zIndex: 90,
            top: 12,
            left: 76,
            right: 16,
            maxWidth: 680,
            padding: 12,
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            fontSize: 13,
          }}
        >
          {aviso && <p role="status">{aviso}</p>}
          {legado && (
            <p>
              Há dados antigos sem conta identificada neste navegador. Eles não
              foram abertos nem apagados.{" "}
              <button
                type="button"
                onClick={importarLegado}
                style={{ textDecoration: "underline" }}
              >
                Importar meus dados antigos
              </button>
            </p>
          )}
          {legacyAccount && (
            <p>
              Há funis locais antigos desta conta sem workspace identificado.
              Eles foram preservados.{" "}
              <button
                type="button"
                style={{ textDecoration: "underline" }}
                onClick={() => {
                  if (
                    !legacyUserId ||
                    !window.confirm(
                      "Confirma que os funis locais antigos desta conta pertencem ao workspace selecionado? Vamos copiar os registros sem apagar nenhum original ou versão atual.",
                    )
                  )
                    return;
                  try {
                    const old =
                      criarCofreFunil(legacyUserId).exportarEnvelope();
                    const entries = [...old.funis];
                    if (old.rascunho)
                      entries.push({
                        id: old.rascunho.id,
                        nome: `${old.rascunho.nome} (rascunho antigo)`,
                        atualizadoEm: new Date().toISOString(),
                        data: old.rascunho,
                      });
                    const copies = {
                      ...old,
                      rascunho: null,
                      funis: entries.map((record) => {
                        const id = crypto.randomUUID();
                        const name = `${record.nome} (cópia local antiga)`;
                        return {
                          ...record,
                          id,
                          nome: name,
                          data: {
                            ...preservePackageReferences(record.data),
                            id,
                            nome: name,
                          },
                        };
                      }),
                    };
                    cofre.substituirEnvelope(
                      mergeFunnelEnvelopes(cofre.exportarEnvelope(), copies),
                      true,
                    );
                    setLegacyAccount(false);
                    setAviso(
                      "Cópias preservadas em Meus funis no workspace atual. Os originais não foram apagados.",
                    );
                  } catch (error) {
                    setAviso(
                      error instanceof Error
                        ? error.message
                        : "Não foi possível copiar. Os originais permanecem intactos.",
                    );
                  }
                }}
              >
                Copiar meus funis antigos
              </button>
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setLegado(false);
              setLegacyAccount(false);
            }}
            aria-label="Fechar aviso de armazenamento"
            style={{ marginTop: 8, textDecoration: "underline" }}
          >
            Fechar aviso
          </button>
        </div>
      )}
      <FunnelBoard
        key={`${dados.id}:${resetSeq}`}
        storageId={storageId}
        cofre={cofre}
        inicial={dados}
        focoTipo={focoTipo}
        initialPanel={initialPanel}
        syncStatus={syncStatus}
        onSyncRetry={() => void sync.current?.retry()}
        onRascunho={(data) => cofre.salvarRascunho(data)}
        onVoltar={() => router.push("/campanhas")}
        onSalvar={salvar}
        onAbrir={(data) => {
          setDados(validarFunnelData(data));
          setResetSeq((n) => n + 1);
        }}
        onArquivar={(data) => {
          cofre.arquivarFunil(data);
          setDados({
            ...FUNIL_DEMO,
            id: `funil-${crypto.randomUUID()}`,
            nome: "Novo funil",
            nodes: [],
            edges: [],
          });
          setResetSeq((n) => n + 1);
        }}
        onExcluir={() => {
          cofre.removerRascunho();
          setDados(FUNIL_DEMO);
          setResetSeq((n) => n + 1);
        }}
      />
    </div>
  );
}
