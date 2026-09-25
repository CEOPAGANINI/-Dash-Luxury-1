/*
  O modelo do Filtro de acesso — quem pode ver o seu site.

  Uma regra honesta: ela vale para TODO visitante do mesmo jeito (país e
  aparelho), inclusive o revisor de anúncio. Não serve para mostrar uma
  página ao robô e outra à pessoa — isso seria cloaking, que derruba a
  conta e não é o que esta ferramenta faz.

  Tudo aqui é puro, para o teste não depender de nada. A tela é só
  demonstração — a regra não está ligada em servidor nenhum.
*/

export type DeviceKind = "mobile" | "desktop" | "tablet";

/** "allow" = liberar só os países da lista; "block" = bloquear os da lista. */
export type CountryMode = "allow" | "block";

/** O que acontece com quem a regra barra. */
export type BlockedAction = "not_found" | "redirect" | "message";

export interface PaisDef {
  code: string;
  nome: string;
  flag: string;
}

export interface DispositivoDef {
  id: DeviceKind;
  nome: string;
}

/** Países comuns em campanhas, para os chips da regra e do simulador. */
export const PAISES: PaisDef[] = [
  { code: "BR", nome: "Brasil", flag: "🇧🇷" },
  { code: "PT", nome: "Portugal", flag: "🇵🇹" },
  { code: "US", nome: "Estados Unidos", flag: "🇺🇸" },
  { code: "RU", nome: "Rússia", flag: "🇷🇺" },
  { code: "MX", nome: "México", flag: "🇲🇽" },
  { code: "AR", nome: "Argentina", flag: "🇦🇷" },
  { code: "ES", nome: "Espanha", flag: "🇪🇸" },
  { code: "CO", nome: "Colômbia", flag: "🇨🇴" },
  { code: "CL", nome: "Chile", flag: "🇨🇱" },
  { code: "IN", nome: "Índia", flag: "🇮🇳" },
  { code: "DE", nome: "Alemanha", flag: "🇩🇪" },
  { code: "FR", nome: "França", flag: "🇫🇷" },
  { code: "GB", nome: "Reino Unido", flag: "🇬🇧" },
  { code: "IT", nome: "Itália", flag: "🇮🇹" },
  { code: "CN", nome: "China", flag: "🇨🇳" },
  { code: "NG", nome: "Nigéria", flag: "🇳🇬" },
];

export const DISPOSITIVOS: DispositivoDef[] = [
  { id: "mobile", nome: "Celular" },
  { id: "desktop", nome: "Computador" },
  { id: "tablet", nome: "Tablet" },
];

const NOME_PAIS = new Map(PAISES.map((p) => [p.code, p]));
const NOME_DISPOSITIVO = new Map(DISPOSITIVOS.map((d) => [d.id, d.nome]));

export function nomeDoPais(code: string): string {
  const p = NOME_PAIS.get(code);
  return p ? `${p.flag} ${p.nome}` : code;
}

export function nomeDoDispositivo(id: DeviceKind): string {
  return NOME_DISPOSITIVO.get(id) ?? id;
}

/** A regra de acesso de um site. */
export interface AccessRule {
  paisesMode: CountryMode;
  /** Códigos de país escolhidos (liberados ou bloqueados, conforme o modo). */
  paises: string[];
  /** Aparelhos que PODEM ver a página. */
  dispositivos: DeviceKind[];
  /** O que fazer com quem for barrado. */
  acao: BlockedAction;
  /** Destino do redirecionamento, quando a ação é "redirect". */
  redirectUrl: string;
}

/** Um visitante hipotético, para o simulador. */
export interface Visitor {
  pais: string;
  dispositivo: DeviceKind;
}

export interface Veredito {
  permitido: boolean;
  /** Por que passou ou foi barrado, em uma linha. */
  motivo: string;
}

/**
 * Avalia se um visitante veria a página, pela regra. A ordem é país e
 * depois aparelho; o primeiro que barrar decide. A mesma regra vale para
 * qualquer visitante — é isso que a torna honesta.
 */
export function avaliarAcesso(regra: AccessRule, visitante: Visitor): Veredito {
  const naLista = regra.paises.includes(visitante.pais);
  const paisOk = regra.paisesMode === "allow" ? naLista : !naLista;
  if (!paisOk) {
    return {
      permitido: false,
      motivo:
        regra.paisesMode === "allow"
          ? `${nomeDoPais(visitante.pais)} não está na lista de liberados`
          : `${nomeDoPais(visitante.pais)} está na lista de bloqueados`,
    };
  }
  if (!regra.dispositivos.includes(visitante.dispositivo)) {
    return {
      permitido: false,
      motivo: `${nomeDoDispositivo(visitante.dispositivo)} não está liberado`,
    };
  }
  return { permitido: true, motivo: "Passa em todas as regras" };
}

/** Descreve, em uma frase, o que a regra faz com quem é barrado. */
export function descreverAcao(regra: AccessRule): string {
  switch (regra.acao) {
    case "not_found":
      return "Mostrar página não encontrada (404)";
    case "redirect":
      return regra.redirectUrl
        ? `Redirecionar para ${regra.redirectUrl}`
        : "Redirecionar (endereço ainda não definido)";
    case "message":
      return "Mostrar um aviso de indisponível";
  }
}

/**
 * Um resumo em texto da regra — quantos países, quais aparelhos —, para o
 * cabeçalho da tela e para os testes.
 */
export function resumoDaRegra(regra: AccessRule): string {
  const p =
    regra.paises.length === 0
      ? regra.paisesMode === "allow"
        ? "nenhum país liberado"
        : "nenhum país bloqueado"
      : regra.paisesMode === "allow"
        ? `libera ${regra.paises.length} país(es)`
        : `bloqueia ${regra.paises.length} país(es)`;
  const d =
    regra.dispositivos.length === DISPOSITIVOS.length
      ? "todos os aparelhos"
      : regra.dispositivos.length === 0
        ? "nenhum aparelho"
        : regra.dispositivos.map(nomeDoDispositivo).join(", ").toLowerCase();
  return `${p} · ${d}`;
}

/** A regra de exemplo com que a tela abre: só Brasil, só no celular. */
export const REGRA_EXEMPLO: AccessRule = {
  paisesMode: "allow",
  paises: ["BR"],
  dispositivos: ["mobile"],
  acao: "not_found",
  redirectUrl: "",
};
