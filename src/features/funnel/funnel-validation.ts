import { z } from "zod";

import { ROTULO_TIPO, type FunnelData } from "./funnel-model";

const texto = z.string().max(100_000);
const id = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (value) => !["__proto__", "constructor", "prototype"].includes(value),
  );
const numero = z.number().finite();
const positivo = numero.nonnegative();
const flags = z.record(z.string(), z.boolean());
const linha = z.object({
  forma: z.enum(["curva", "reta", "cotovelo", "livre"]).optional(),
  pontas: z.enum(["fim", "ambas", "nenhuma"]).optional(),
  tracejada: z.boolean().optional(),
  fluxo: z.boolean().optional(),
  cor: texto.optional(),
  espessura: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  pontos: z
    .array(z.object({ x: numero, y: numero }))
    .max(500)
    .optional(),
});
const zip = z
  .object({
    nome: texto,
    tamanho: positivo,
    ok: z.boolean(),
    sourceFunnelId: id.optional(),
  })
  .passthrough();
const pagina = z
  .object({
    dominio: texto.optional(),
    caminho: texto,
    meta: z
      .object({
        titulo: texto.optional(),
        descricao: texto.optional(),
        imagem: texto.optional(),
        faviconPng: texto.optional(),
        esconderDoGoogle: z.boolean().optional(),
        metaPixel: texto.optional(),
        ga4: texto.optional(),
        gtm: texto.optional(),
        clarity: texto.optional(),
        repassarUtm: z.boolean().optional(),
        protecao: flags.optional(),
        velocidade: z.union([flags, z.literal(false)]).optional(),
        indexacao: flags.optional(),
      })
      .passthrough(),
    backRedirect: z
      .object({
        ligado: z.boolean().optional(),
        destinoEtapaId: texto.optional(),
        url: texto.optional(),
        botaoVoltar: z.boolean().optional(),
        fecharAba: z.boolean().optional(),
        mouseSaindo: z.boolean().optional(),
        inatividade: z.boolean().optional(),
        inatividadeSeg: positivo.optional(),
        armarApos: positivo.optional(),
        umaVez: z.boolean().optional(),
        repassarUtm: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    saidas: z.record(
      z.string().max(200),
      z.object({ etapaId: texto.optional(), url: texto.optional() }),
    ),
    zip: zip.optional(),
  })
  .passthrough();
const regra = z
  .object({
    id,
    tipo: z.enum([
      "regiao",
      "dispositivo",
      "sistema",
      "rede",
      "origem",
      "fatia",
    ]),
    paises: z.array(texto).max(300),
    dispositivos: z.array(z.enum(["mobile", "desktop", "tablet"])),
    sistemas: z
      .array(
        z.enum([
          "windows",
          "macos",
          "ios",
          "android",
          "linux",
          "chromeos",
          "outro_so",
        ]),
      )
      .optional(),
    redes: z
      .array(z.enum(["wifi", "cabo", "cel5g", "cel4g", "cel3g", "outra_rede"]))
      .optional(),
    origens: z
      .array(
        z.enum([
          "facebook",
          "instagram",
          "google",
          "youtube",
          "tiktok",
          "taboola",
          "outbrain",
          "kwai",
          "pinterest",
          "snapchat",
          "bing",
          "outra_origem",
        ]),
      )
      .optional(),
    percentual: positivo.max(100),
    destino: texto,
    ativo: z.boolean(),
    destinoNoId: texto.optional(),
    estilo: linha.optional(),
  })
  .passthrough();
const node = z
  .object({
    id,
    type: z.enum(
      Object.keys(ROTULO_TIPO) as [
        keyof typeof ROTULO_TIPO,
        ...(keyof typeof ROTULO_TIPO)[],
      ],
    ),
    x: numero,
    y: numero,
    title: texto,
    url: texto.optional(),
    headline: texto.optional(),
    descricao: texto.optional(),
    buttonLabel: texto.optional(),
    imageUrl: texto.optional(),
    cor: texto.optional(),
    sigla: texto.optional(),
    pagina: pagina.optional(),
    redir: z.object({
      regras: z.array(regra).max(500),
      campanhaId: z.string().regex(/^[1-9]\d{0,11}$/).optional(),
    }).optional(),
    estilo: z
      .object({
        cor: texto.optional(),
        borda: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        texto: z.enum(["normal", "grande"]).optional(),
        negrito: z.boolean().optional(),
      })
      .optional(),
    w: positivo.optional(),
    h: positivo.optional(),
    forma: z.enum(["retangulo", "circulo", "losango"]).optional(),
    mensagens: z
      .array(z.object({ autor: texto, texto, quando: texto }))
      .max(1000)
      .optional(),
    previsao: z
      .object({
        conversao: positivo.max(100).optional(),
        preco: positivo.optional(),
        visitas: positivo.optional(),
      })
      .optional(),
    loja: z
      .object({
        plataforma: z.enum([
          "vps",
          "shopify",
          "nuvemshop",
          "woocommerce",
          "outra",
        ]),
        dominio: texto.optional(),
        moeda: z.enum(["BRL", "USD"]),
        destaqueId: texto.optional(),
        produtos: z
          .array(
            z.object({
              id,
              nome: texto,
              preco: positivo,
              caminho: texto,
              ativo: z.boolean(),
              zip: zip.optional(),
            }),
          )
          .max(1000),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Validate persisted/imported JSON before any UI can dereference it. */
export const funnelDataSchema = z
  .object({
    id,
    nome: texto,
    projeto: texto,
    nodes: z.array(node).max(2000),
    edges: z
      .array(
        z.object({
          id,
          source: id,
          target: id,
          estilo: linha.optional(),
          rotulo: texto.optional(),
        }),
      )
      .max(5000),
    mapa: z
      .object({
        fundo: z.enum(["pontos", "grade", "liso"]).optional(),
        corLinha: texto.optional(),
        fluxo: z.boolean().optional(),
        tema: z.enum(["padrao", "azul", "grafite", "papel"]).optional(),
      })
      .optional(),
    previsao: z
      .object({
        cenario: z.enum(["pessimista", "realista", "otimista"]),
        cpc: positivo,
      })
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const ids = new Set(data.nodes.map((n) => n.id));
    if (
      ids.size !== data.nodes.length ||
      new Set(data.edges.map((e) => e.id)).size !== data.edges.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Identificadores duplicados no funil.",
      });
    }
    if (data.edges.some((e) => !ids.has(e.source) || !ids.has(e.target))) {
      ctx.addIssue({
        code: "custom",
        message: "Ligação aponta para um bloco inexistente.",
      });
    }
  });

export function validarFunnelData(value: unknown): FunnelData {
  const parsed = funnelDataSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      "Funil inválido ou corrompido. Os dados originais foram preservados; importe uma cópia válida.",
    );
  }
  return parsed.data as FunnelData;
}

/** A filename is not an uploaded artifact; files must be selected again after reload. */
export function funilSemArquivosTemporarios(value: unknown): FunnelData {
  const data = validarFunnelData(value);
  return {
    ...data,
    nodes: data.nodes.map((n) => ({
      ...n,
      ...(n.pagina
        ? {
            pagina: {
              ...n.pagina,
              ...(n.pagina.zip ? { zip: { ...n.pagina.zip, ok: false } } : {}),
            },
          }
        : {}),
      ...(n.loja
        ? {
            loja: {
              ...n.loja,
              produtos: n.loja.produtos.map((p) => ({
                ...p,
                ...(p.zip ? { zip: { ...p.zip, ok: false } } : {}),
              })),
            },
          }
        : {}),
    })),
  };
}


