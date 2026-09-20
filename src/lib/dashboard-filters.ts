/**
 * Chave única dos filtros globais do dashboard no localStorage.
 * Guardamos período, filtros e os dias escolhidos no Calendário — é o que
 * faz a escolha valer em todas as áreas. Qualquer componente que precise
 * reagir ao período lê daqui, sempre com o padrão de hidratação assíncrona
 * (ler depois de montar) para o HTML do servidor e do cliente coincidirem.
 */
export const FILTERS_STORAGE_KEY = "dash-global-filters-v1";

export interface StoredGlobalFilters {
  period?: string;
  /** Os filtros da barra global — cada componente conhece as próprias chaves. */
  filters?: Readonly<Record<string, string>>;
  selectedDates?: string[] | null;
}

/**
 * Aviso de que os filtros mudaram, para os blocos que estão na mesma página.
 * O evento nativo "storage" só chega em OUTRAS abas; como o dashboard agora
 * desenha vários blocos independentes lado a lado, cada um precisa saber na
 * hora que o período mudou no bloco do vizinho.
 */
export const FILTERS_EVENT = "dash-global-filters-changed";

/** Salva os filtros e avisa os outros blocos da página. */
export function writeStoredFilters(value: StoredGlobalFilters) {
  try {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(FILTERS_EVENT, { detail: value }));
  } catch {
    // Sem storage (modo privado etc.): os filtros só não persistem.
  }
}

/** Leitura defensiva: storage indisponível ou corrompido vira null. */
export function readStoredFilters(): StoredGlobalFilters | null {
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredGlobalFilters) : null;
  } catch {
    return null;
  }
}
