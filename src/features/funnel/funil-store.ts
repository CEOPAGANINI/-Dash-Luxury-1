import { z } from "zod";

import type { FunnelData } from "./funnel-model";
import { preservePackageReferences } from "./package-references";
import {
  funnelDataSchema,
  funilSemArquivosTemporarios,
  validarFunnelData,
} from "./funnel-validation";

export interface FunilSalvo {
  id: string;
  nome: string;
  atualizadoEm: string;
  data: FunnelData;
  arquivado?: boolean;
}

export interface RedirSalvo {
  id: string;
  nome: string;
  atualizadoEm: string;
  estado: unknown;
}

const registro = z
  .object({
    id: z.string().min(1),
    nome: z.string(),
    atualizadoEm: z.iso.datetime(),
    data: funnelDataSchema,
    arquivado: z.boolean().optional(),
  })
  .refine((f) => f.id === f.data.id);
const redirecionador = z.object({
  id: z.string().min(1),
  nome: z.string(),
  atualizadoEm: z.iso.datetime(),
  estado: z.json(),
});
export const funnelEnvelopeSchema = z
  .object({
    versao: z.literal(1),
    revisao: z.string().min(1),
    rascunho: funnelDataSchema.nullable(),
    funis: z.array(registro).max(500),
    redirecionadores: z.array(redirecionador).max(500),
  })
  .strict()
  .refine((v) => new Set(v.funis.map((f) => f.id)).size === v.funis.length);
export interface FunnelEnvelope {
  versao: 1;
  revisao: string;
  rascunho: FunnelData | null;
  funis: FunilSalvo[];
  redirecionadores: RedirSalvo[];
}
type Envelope = FunnelEnvelope;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export class ErroCofreFunil extends Error {
  constructor(
    public readonly codigo:
      "indisponivel" | "corrompido" | "conflito" | "gravacao" | "confirmacao",
    message: string,
  ) {
    super(message);
    this.name = "ErroCofreFunil";
  }
}

function identificador(storageId: string): string {
  if (!storageId.trim())
    throw new Error("É necessário entrar na conta para salvar o funil.");
  return encodeURIComponent(storageId);
}

export function funnelStorageKey(storageId: string): string {
  return `dash:funil:v1:${identificador(storageId)}`;
}

export function funnelClipboardKey(storageId: string): string {
  return `dash:funil:clipboard:v1:${identificador(storageId)}`;
}

export const CHAVES_LEGADAS_FUNIL = [
  "funnel-board:demo",
  "dash:funis",
  "dash:redirecionadores",
] as const;

function novoId(prefixo: string): string {
  return `${prefixo}-${globalThis.crypto.randomUUID()}`;
}

export function novoIdDeFunil(): string {
  return novoId("funil");
}

function clonar<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** One atomic account-scoped envelope, explicit saves and optimistic revisions.
 * Each mounted editor owns an instance: reading a list never silently accepts a
 * newer tab's revision. Reloading is explicit so unsaved changes remain intact.
 */
export function criarCofreFunil(storageId: string, storage?: StorageLike) {
  const chave = funnelStorageKey(storageId);
  let carregado = false;
  let original: string | null = null;
  let estado: Envelope;
  const listeners = new Set<() => void>();

  function local(): StorageLike {
    try {
      if (storage) return storage;
      if (typeof window !== "undefined") return window.localStorage;
    } catch {
      /* Access itself may be forbidden by browser privacy settings. */
    }
    throw new ErroCofreFunil(
      "indisponivel",
      "Armazenamento do navegador indisponível. Nada foi salvo; mantenha esta aba aberta e exporte seu funil.",
    );
  }

  function lerChave(key: string): string | null {
    try {
      return local().getItem(key);
    } catch (error) {
      if (error instanceof ErroCofreFunil) throw error;
      throw new ErroCofreFunil(
        "indisponivel",
        "Não foi possível ler os funis deste navegador. Os dados não foram alterados.",
      );
    }
  }

  function carregar(): Envelope {
    if (carregado) return estado;
    const raw = lerChave(chave);
    try {
      estado =
        raw === null
          ? {
              versao: 1,
              revisao: novoId("rev"),
              rascunho: null,
              funis: [],
              redirecionadores: [],
            }
          : funnelEnvelopeSchema.parse(JSON.parse(raw));
    } catch {
      throw new ErroCofreFunil(
        "corrompido",
        "O armazenamento desta conta está corrompido ou é incompatível. Nada foi sobrescrito; preserve esta aba e recupere uma cópia válida.",
      );
    }
    original = raw;
    carregado = true;
    return estado;
  }

  function gravar(proximo: Envelope): void {
    carregar();
    if (lerChave(chave) !== original) {
      throw new ErroCofreFunil(
        "conflito",
        "Outra aba alterou os funis desta conta. Nada foi sobrescrito. Exporte suas alterações antes de recarregar a página.",
      );
    }
    const validado = funnelEnvelopeSchema.safeParse({
      ...proximo,
      revisao: novoId("rev"),
    });
    if (!validado.success)
      throw new ErroCofreFunil(
        "corrompido",
        "Os dados do funil são inválidos. O salvamento anterior foi preservado.",
      );
    const raw = JSON.stringify(validado.data);
    try {
      local().setItem(chave, raw);
    } catch (error) {
      if (error instanceof ErroCofreFunil) throw error;
      throw new ErroCofreFunil(
        "gravacao",
        "Não foi possível salvar: armazenamento cheio ou bloqueado. Suas alterações continuam nesta aba; exporte o funil antes de sair.",
      );
    }
    original = raw;
    estado = validado.data;
    listeners.forEach((listener) => listener());
  }

  const cofre = {
    chave,
    clipboardKey: funnelClipboardKey(storageId),
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    exportarEnvelope(): FunnelEnvelope {
      return clonar(carregar());
    },
    /** Cloud imports preserve the old local bytes as a recoverable backup. */
    substituirEnvelope(value: unknown, notify = false): void {
      const parsed = funnelEnvelopeSchema.parse(value);
      carregar();
      if (lerChave(chave) !== original)
        throw new ErroCofreFunil(
          "conflito",
          "Outra aba alterou o funil. Recarregue para sincronizar sem sobrescrever.",
        );
      try {
        if (original !== null) local().setItem(`${chave}:backup`, original);
        const raw = JSON.stringify(parsed);
        local().setItem(chave, raw);
        original = raw;
        estado = parsed;
        if (notify) listeners.forEach((listener) => listener());
      } catch {
        throw new ErroCofreFunil(
          "gravacao",
          "Não foi possível guardar a cópia sincronizada. A versão do servidor foi preservada.",
        );
      }
    },
    get revisao(): string {
      return carregado ? estado.revisao : "";
    },
    lerRascunho(): FunnelData | null {
      const data = carregar().rascunho;
      return data ? funilSemArquivosTemporarios(data) : null;
    },
    salvarRascunho(data: FunnelData): void {
      gravar({ ...carregar(), rascunho: validarFunnelData(data) });
    },
    removerRascunho(): void {
      gravar({ ...carregar(), rascunho: null });
    },
    listarFunis(): FunilSalvo[] {
      return carregar()
        .funis.map((f) => ({
          ...clonar(f),
          data: funilSemArquivosTemporarios(f.data),
        }))
        .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
    },
    /** Vault entry and current draft commit together, never one without the other. */
    salvarFunil(data: FunnelData, nome?: string): FunilSalvo {
      const n = (nome ?? data.nome).trim() || "Funil sem nome";
      const valido = validarFunnelData({ ...data, nome: n });
      const reg: FunilSalvo = {
        id: valido.id,
        nome: n,
        atualizadoEm: new Date().toISOString(),
        data: valido,
      };
      const atual = carregar();
      const lista = atual.funis.filter((f) => f.id !== reg.id);
      gravar({ ...atual, rascunho: valido, funis: [...lista, reg] });
      return clonar(reg);
    },
    removerFunil(id: string): void {
      const atual = carregar();
      gravar({ ...atual, funis: atual.funis.filter((f) => f.id !== id) });
    },
    arquivarFunil(data: FunnelData): FunilSalvo {
      const atual = carregar();
      const valido = validarFunnelData(data);
      const reg: FunilSalvo = {
        id: valido.id,
        nome: valido.nome,
        atualizadoEm: new Date().toISOString(),
        data: valido,
        arquivado: true,
      };
      gravar({
        ...atual,
        rascunho: null,
        funis: [...atual.funis.filter((f) => f.id !== valido.id), reg],
      });
      return clonar(reg);
    },
    restaurarFunil(id: string): void {
      const atual = carregar();
      gravar({
        ...atual,
        funis: atual.funis.map((f) =>
          f.id === id ? { ...f, arquivado: false } : f,
        ),
      });
    },
    duplicarFunil(id: string): FunilSalvo | null {
      const f = carregar().funis.find((item) => item.id === id);
      if (!f) return null;
      const reg = {
        ...clonar(f),
        id: novoIdDeFunil(),
        nome: `${f.nome} (cópia)`,
        atualizadoEm: new Date().toISOString(),
      };
      reg.data = validarFunnelData({
        ...preservePackageReferences(reg.data),
        id: reg.id,
        nome: reg.nome,
      });
      gravar({ ...carregar(), funis: [...carregar().funis, reg] });
      return clonar(reg);
    },
    listarRedirs(): RedirSalvo[] {
      return clonar(carregar().redirecionadores).sort((a, b) =>
        b.atualizadoEm.localeCompare(a.atualizadoEm),
      );
    },
    salvarRedir(nome: string, estadoRedir: unknown, id?: string): RedirSalvo {
      const parsed = redirecionador.safeParse({
        id: id ?? novoId("redir"),
        nome: nome.trim() || "Redirecionador sem nome",
        atualizadoEm: new Date().toISOString(),
        estado: estadoRedir,
      });
      if (!parsed.success)
        throw new ErroCofreFunil(
          "corrompido",
          "Configuração do redirecionador inválida. Nada foi salvo.",
        );
      const atual = carregar();
      gravar({
        ...atual,
        redirecionadores: [
          ...atual.redirecionadores.filter((r) => r.id !== parsed.data.id),
          parsed.data,
        ],
      });
      return clonar(parsed.data);
    },
    removerRedir(id: string): void {
      const atual = carregar();
      gravar({
        ...atual,
        redirecionadores: atual.redirecionadores.filter((r) => r.id !== id),
      });
    },
    legadoDisponivel(): boolean {
      return CHAVES_LEGADAS_FUNIL.some((key) => lerChave(key) !== null);
    },
    /** Never attribute unscoped records to whoever happens to sign in. */
    importarLegado(confirmado: boolean): number {
      if (!confirmado)
        throw new ErroCofreFunil(
          "confirmacao",
          "Confirme que os dados antigos deste navegador pertencem a você antes de importar.",
        );
      const atual = carregar();
      let draft: FunnelData | null;
      let funis: FunilSalvo[];
      let redirs: RedirSalvo[];
      try {
        const rawDraft = lerChave(CHAVES_LEGADAS_FUNIL[0]);
        draft = rawDraft ? validarFunnelData(JSON.parse(rawDraft)) : null;
        const rawFunis = lerChave(CHAVES_LEGADAS_FUNIL[1]);
        funis = rawFunis ? z.array(registro).parse(JSON.parse(rawFunis)) : [];
        const rawRedirs = lerChave(CHAVES_LEGADAS_FUNIL[2]);
        redirs = rawRedirs
          ? z.array(redirecionador).parse(JSON.parse(rawRedirs))
          : [];
      } catch {
        throw new ErroCofreFunil(
          "corrompido",
          "Há dados antigos inválidos ou inacessíveis. Nenhum dado antigo foi apagado e a importação não foi realizada.",
        );
      }
      if (
        draft &&
        !funis.some((f) => JSON.stringify(f.data) === JSON.stringify(draft))
      ) {
        funis.push({
          id: draft.id,
          nome: funis.some((f) => f.id === draft.id)
            ? `${draft.nome} (rascunho antigo)`
            : draft.nome,
          atualizadoEm: new Date().toISOString(),
          data: draft,
        });
      }
      const importados = funis.map((f) => {
        const id = novoIdDeFunil();
        return {
          ...f,
          id,
          data: funilSemArquivosTemporarios({ ...f.data, id, nome: f.nome }),
        };
      });
      const redirsImportados = redirs.map((r) => ({
        ...r,
        id: novoId("redir"),
      }));
      gravar({
        ...atual,
        funis: [...atual.funis, ...importados],
        redirecionadores: [...atual.redirecionadores, ...redirsImportados],
      });
      return importados.length + redirsImportados.length;
    },
  };
  return cofre;
}

export type CofreFunil = ReturnType<typeof criarCofreFunil>;

export function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
