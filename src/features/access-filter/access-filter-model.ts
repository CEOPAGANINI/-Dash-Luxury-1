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
}

export interface DispositivoDef {
  id: DeviceKind;
  nome: string;
}

/** Todos os países do mundo (ISO 3166-1 alpha-2), em ordem alfabética. */
export const PAISES: PaisDef[] = [
  { code: "AF", nome: "Afeganistão" },
  { code: "ZA", nome: "África do Sul" },
  { code: "AL", nome: "Albânia" },
  { code: "DE", nome: "Alemanha" },
  { code: "AD", nome: "Andorra" },
  { code: "AO", nome: "Angola" },
  { code: "AI", nome: "Anguila" },
  { code: "AG", nome: "Antígua e Barbuda" },
  { code: "SA", nome: "Arábia Saudita" },
  { code: "DZ", nome: "Argélia" },
  { code: "AR", nome: "Argentina" },
  { code: "AM", nome: "Armênia" },
  { code: "AW", nome: "Aruba" },
  { code: "AU", nome: "Austrália" },
  { code: "AT", nome: "Áustria" },
  { code: "AZ", nome: "Azerbaijão" },
  { code: "BS", nome: "Bahamas" },
  { code: "BH", nome: "Bahrein" },
  { code: "BD", nome: "Bangladesh" },
  { code: "BB", nome: "Barbados" },
  { code: "BE", nome: "Bélgica" },
  { code: "BZ", nome: "Belize" },
  { code: "BJ", nome: "Benin" },
  { code: "BM", nome: "Bermudas" },
  { code: "BY", nome: "Bielorrússia" },
  { code: "BO", nome: "Bolívia" },
  { code: "BA", nome: "Bósnia e Herzegovina" },
  { code: "BW", nome: "Botsuana" },
  { code: "BR", nome: "Brasil" },
  { code: "BN", nome: "Brunei" },
  { code: "BG", nome: "Bulgária" },
  { code: "BF", nome: "Burquina Faso" },
  { code: "BI", nome: "Burundi" },
  { code: "BT", nome: "Butão" },
  { code: "CV", nome: "Cabo Verde" },
  { code: "CM", nome: "Camarões" },
  { code: "KH", nome: "Camboja" },
  { code: "CA", nome: "Canadá" },
  { code: "QA", nome: "Catar" },
  { code: "KZ", nome: "Cazaquistão" },
  { code: "TD", nome: "Chade" },
  { code: "CL", nome: "Chile" },
  { code: "CN", nome: "China" },
  { code: "CY", nome: "Chipre" },
  { code: "CO", nome: "Colômbia" },
  { code: "KM", nome: "Comores" },
  { code: "CG", nome: "Congo" },
  { code: "CD", nome: "Congo (RDC)" },
  { code: "KP", nome: "Coreia do Norte" },
  { code: "KR", nome: "Coreia do Sul" },
  { code: "CI", nome: "Costa do Marfim" },
  { code: "CR", nome: "Costa Rica" },
  { code: "HR", nome: "Croácia" },
  { code: "CU", nome: "Cuba" },
  { code: "CW", nome: "Curaçao" },
  { code: "DK", nome: "Dinamarca" },
  { code: "DJ", nome: "Djibuti" },
  { code: "DM", nome: "Dominica" },
  { code: "EG", nome: "Egito" },
  { code: "SV", nome: "El Salvador" },
  { code: "AE", nome: "Emirados Árabes Unidos" },
  { code: "EC", nome: "Equador" },
  { code: "ER", nome: "Eritreia" },
  { code: "SK", nome: "Eslováquia" },
  { code: "SI", nome: "Eslovênia" },
  { code: "ES", nome: "Espanha" },
  { code: "SZ", nome: "Essuatíni" },
  { code: "US", nome: "Estados Unidos" },
  { code: "EE", nome: "Estônia" },
  { code: "ET", nome: "Etiópia" },
  { code: "FJ", nome: "Fiji" },
  { code: "PH", nome: "Filipinas" },
  { code: "FI", nome: "Finlândia" },
  { code: "FR", nome: "França" },
  { code: "GA", nome: "Gabão" },
  { code: "GM", nome: "Gâmbia" },
  { code: "GH", nome: "Gana" },
  { code: "GE", nome: "Geórgia" },
  { code: "GI", nome: "Gibraltar" },
  { code: "GD", nome: "Granada" },
  { code: "GR", nome: "Grécia" },
  { code: "GL", nome: "Groenlândia" },
  { code: "GP", nome: "Guadalupe" },
  { code: "GU", nome: "Guam" },
  { code: "GT", nome: "Guatemala" },
  { code: "GG", nome: "Guernsey" },
  { code: "GY", nome: "Guiana" },
  { code: "GF", nome: "Guiana Francesa" },
  { code: "GN", nome: "Guiné" },
  { code: "GQ", nome: "Guiné Equatorial" },
  { code: "GW", nome: "Guiné-Bissau" },
  { code: "HT", nome: "Haiti" },
  { code: "NL", nome: "Holanda" },
  { code: "HN", nome: "Honduras" },
  { code: "HK", nome: "Hong Kong" },
  { code: "HU", nome: "Hungria" },
  { code: "YE", nome: "Iêmen" },
  { code: "BV", nome: "Ilha Bouvet" },
  { code: "CX", nome: "Ilha Christmas" },
  { code: "IM", nome: "Ilha de Man" },
  { code: "KY", nome: "Ilhas Cayman" },
  { code: "CC", nome: "Ilhas Cocos" },
  { code: "CK", nome: "Ilhas Cook" },
  { code: "FO", nome: "Ilhas Faroé" },
  { code: "FK", nome: "Ilhas Malvinas" },
  { code: "MP", nome: "Ilhas Marianas" },
  { code: "MH", nome: "Ilhas Marshall" },
  { code: "SB", nome: "Ilhas Salomão" },
  { code: "VG", nome: "Ilhas Virgens Brit." },
  { code: "VI", nome: "Ilhas Virgens EUA" },
  { code: "IN", nome: "Índia" },
  { code: "ID", nome: "Indonésia" },
  { code: "IR", nome: "Irã" },
  { code: "IQ", nome: "Iraque" },
  { code: "IE", nome: "Irlanda" },
  { code: "IS", nome: "Islândia" },
  { code: "IL", nome: "Israel" },
  { code: "IT", nome: "Itália" },
  { code: "JM", nome: "Jamaica" },
  { code: "JP", nome: "Japão" },
  { code: "JE", nome: "Jersey" },
  { code: "JO", nome: "Jordânia" },
  { code: "KW", nome: "Kuwait" },
  { code: "LA", nome: "Laos" },
  { code: "LS", nome: "Lesoto" },
  { code: "LV", nome: "Letônia" },
  { code: "LB", nome: "Líbano" },
  { code: "LR", nome: "Libéria" },
  { code: "LY", nome: "Líbia" },
  { code: "LI", nome: "Liechtenstein" },
  { code: "LT", nome: "Lituânia" },
  { code: "LU", nome: "Luxemburgo" },
  { code: "MO", nome: "Macau" },
  { code: "MK", nome: "Macedônia do Norte" },
  { code: "MG", nome: "Madagascar" },
  { code: "MY", nome: "Malásia" },
  { code: "MW", nome: "Malaui" },
  { code: "MV", nome: "Maldivas" },
  { code: "ML", nome: "Mali" },
  { code: "MT", nome: "Malta" },
  { code: "MA", nome: "Marrocos" },
  { code: "MQ", nome: "Martinica" },
  { code: "MU", nome: "Maurício" },
  { code: "MR", nome: "Mauritânia" },
  { code: "MX", nome: "México" },
  { code: "MM", nome: "Mianmar" },
  { code: "FM", nome: "Micronésia" },
  { code: "MZ", nome: "Moçambique" },
  { code: "MD", nome: "Moldávia" },
  { code: "MC", nome: "Mônaco" },
  { code: "MN", nome: "Mongólia" },
  { code: "ME", nome: "Montenegro" },
  { code: "MS", nome: "Montserrat" },
  { code: "NA", nome: "Namíbia" },
  { code: "NR", nome: "Nauru" },
  { code: "NP", nome: "Nepal" },
  { code: "NI", nome: "Nicarágua" },
  { code: "NE", nome: "Níger" },
  { code: "NG", nome: "Nigéria" },
  { code: "NU", nome: "Niue" },
  { code: "NO", nome: "Noruega" },
  { code: "NC", nome: "Nova Caledônia" },
  { code: "NZ", nome: "Nova Zelândia" },
  { code: "OM", nome: "Omã" },
  { code: "PW", nome: "Palau" },
  { code: "PS", nome: "Palestina" },
  { code: "PA", nome: "Panamá" },
  { code: "PG", nome: "Papua-Nova Guiné" },
  { code: "PK", nome: "Paquistão" },
  { code: "PY", nome: "Paraguai" },
  { code: "PE", nome: "Peru" },
  { code: "PF", nome: "Polinésia Francesa" },
  { code: "PL", nome: "Polônia" },
  { code: "PR", nome: "Porto Rico" },
  { code: "PT", nome: "Portugal" },
  { code: "KE", nome: "Quênia" },
  { code: "KG", nome: "Quirguistão" },
  { code: "GB", nome: "Reino Unido" },
  { code: "CF", nome: "Rep. Centro-Africana" },
  { code: "DO", nome: "Rep. Dominicana" },
  { code: "CZ", nome: "República Tcheca" },
  { code: "RE", nome: "Reunião" },
  { code: "RO", nome: "Romênia" },
  { code: "RW", nome: "Ruanda" },
  { code: "RU", nome: "Rússia" },
  { code: "EH", nome: "Saara Ocidental" },
  { code: "WS", nome: "Samoa" },
  { code: "AS", nome: "Samoa Americana" },
  { code: "SM", nome: "San Marino" },
  { code: "SH", nome: "Santa Helena" },
  { code: "LC", nome: "Santa Lúcia" },
  { code: "BL", nome: "São Bartolomeu" },
  { code: "KN", nome: "São Cristóvão e Névis" },
  { code: "ST", nome: "São Tomé e Príncipe" },
  { code: "VC", nome: "São Vicente e Granadinas" },
  { code: "SC", nome: "Seicheles" },
  { code: "SN", nome: "Senegal" },
  { code: "SL", nome: "Serra Leoa" },
  { code: "RS", nome: "Sérvia" },
  { code: "SG", nome: "Singapura" },
  { code: "SY", nome: "Síria" },
  { code: "SO", nome: "Somália" },
  { code: "LK", nome: "Sri Lanka" },
  { code: "SD", nome: "Sudão" },
  { code: "SS", nome: "Sudão do Sul" },
  { code: "SE", nome: "Suécia" },
  { code: "CH", nome: "Suíça" },
  { code: "SR", nome: "Suriname" },
  { code: "TJ", nome: "Tadjiquistão" },
  { code: "TH", nome: "Tailândia" },
  { code: "TW", nome: "Taiwan" },
  { code: "TZ", nome: "Tanzânia" },
  { code: "TL", nome: "Timor-Leste" },
  { code: "TG", nome: "Togo" },
  { code: "TO", nome: "Tonga" },
  { code: "TT", nome: "Trinidad e Tobago" },
  { code: "TN", nome: "Tunísia" },
  { code: "TM", nome: "Turcomenistão" },
  { code: "TR", nome: "Turquia" },
  { code: "TV", nome: "Tuvalu" },
  { code: "UA", nome: "Ucrânia" },
  { code: "UG", nome: "Uganda" },
  { code: "UY", nome: "Uruguai" },
  { code: "UZ", nome: "Uzbequistão" },
  { code: "VU", nome: "Vanuatu" },
  { code: "VA", nome: "Vaticano" },
  { code: "VE", nome: "Venezuela" },
  { code: "VN", nome: "Vietnã" },
  { code: "ZM", nome: "Zâmbia" },
  { code: "ZW", nome: "Zimbábue" },
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
  return p ? p.nome : code;
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
