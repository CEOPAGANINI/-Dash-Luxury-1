"use client";

import * as React from "react";

import {
  AccessRule,
  BlockedAction,
  DeviceKind,
  DISPOSITIVOS,
  PAISES,
  REGRA_EXEMPLO,
  Visitor,
  avaliarAcesso,
  descreverAcao,
  nomeDoDispositivo,
  nomeDoPais,
  resumoDaRegra,
} from "./access-filter-model";

/*
  A tela do Filtro de acesso — só a interface, a pedido do dono. Você monta
  a regra (países e aparelhos) e o simulador mostra, ali mesmo, quem veria a
  página e quem seria barrado. A mesma regra vale para todo visitante, então
  o revisor de anúncio vê o que qualquer pessoa daquele país e aparelho vê —
  não é cloaking. Nada aqui liga a regra num servidor.
*/

interface SiteDef {
  id: string;
  nome: string;
  dominio: string;
}

const SITES: SiteDef[] = [
  { id: "oferta", nome: "Página de oferta", dominio: "sualoja.com/oferta" },
  { id: "captura", nome: "Página de captura", dominio: "sualoja.com/vip" },
  { id: "quiz", nome: "Quiz de entrada", dominio: "quiz.sualoja.com" },
];

const ACOES: { id: BlockedAction; nome: string }[] = [
  { id: "not_found", nome: "Erro 404" },
  { id: "redirect", nome: "Redirecionar" },
  { id: "message", nome: "Aviso" },
];

export function AccessFilterPanel() {
  const [siteId, setSiteId] = React.useState(SITES[0].id);
  const [regra, setRegra] = React.useState<AccessRule>(REGRA_EXEMPLO);
  const [visitante, setVisitante] = React.useState<Visitor>({
    pais: "RU",
    dispositivo: "desktop",
  });

  const site = SITES.find((s) => s.id === siteId) ?? SITES[0];
  const veredito = avaliarAcesso(regra, visitante);

  const alterar = (patch: Partial<AccessRule>) =>
    setRegra((r) => ({ ...r, ...patch }));

  const togglePais = (code: string) =>
    setRegra((r) => ({
      ...r,
      paises: r.paises.includes(code)
        ? r.paises.filter((c) => c !== code)
        : [...r.paises, code],
    }));

  const toggleDispositivo = (id: DeviceKind) =>
    setRegra((r) => ({
      ...r,
      dispositivos: r.dispositivos.includes(id)
        ? r.dispositivos.filter((d) => d !== id)
        : [...r.dispositivos, id],
    }));

  return (
    <div className="acf">
      <div className="acf__stage">
        <header className="acf__head">
          <div className="acf__brand">
            <span className="acf__mark" aria-hidden>
              ◒
            </span>
            <div>
              <div className="acf__title">Filtro de acesso</div>
              <div className="acf__sub">{resumoDaRegra(regra)}</div>
            </div>
          </div>
          <span className="acf__demo-chip">demonstração</span>
        </header>

        <p className="acf__lead">
          Escolha quem pode ver o seu site por <b>país</b> e <b>aparelho</b>. A
          regra vale igual para <b>todos</b> os visitantes — inclusive o revisor
          de anúncio, que enxerga o mesmo que qualquer pessoa daquele país e
          aparelho.
        </p>

        <div className="acf__grid">
          {/* ── Coluna da regra ─────────────────────────────────────── */}
          <section className="acf__card">
            <div className="acf__card-head">Regra do site</div>

            <div className="acf__field">
              <span className="acf__label">Site</span>
              <div className="acf__pills">
                {SITES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="acf__pill"
                    data-on={s.id === siteId}
                    onClick={() => setSiteId(s.id)}
                  >
                    {s.nome}
                  </button>
                ))}
              </div>
              <small className="acf__hint">{site.dominio}</small>
            </div>

            <div className="acf__field">
              <span className="acf__label">Países</span>
              <div className="acf__seg" role="group" aria-label="Modo dos países">
                <button
                  type="button"
                  className="acf__seg-btn"
                  data-on={regra.paisesMode === "allow"}
                  onClick={() => alterar({ paisesMode: "allow" })}
                >
                  Liberar só estes
                </button>
                <button
                  type="button"
                  className="acf__seg-btn"
                  data-on={regra.paisesMode === "block"}
                  onClick={() => alterar({ paisesMode: "block" })}
                >
                  Bloquear estes
                </button>
              </div>
              <div className="acf__chips">
                {PAISES.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    className="acf__chip"
                    data-on={regra.paises.includes(p.code)}
                    aria-pressed={regra.paises.includes(p.code)}
                    onClick={() => togglePais(p.code)}
                  >
                    <span aria-hidden>{p.flag}</span> {p.nome}
                  </button>
                ))}
              </div>
              {regra.paises.length === 0 && (
                <small className="acf__hint" data-warn>
                  {regra.paisesMode === "allow"
                    ? "Lista vazia no modo “liberar só estes” barra todo mundo."
                    : "Lista vazia no modo “bloquear estes” libera todo mundo."}
                </small>
              )}
            </div>

            <div className="acf__field">
              <span className="acf__label">Aparelhos que podem ver</span>
              <div className="acf__chips">
                {DISPOSITIVOS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="acf__chip"
                    data-on={regra.dispositivos.includes(d.id)}
                    aria-pressed={regra.dispositivos.includes(d.id)}
                    onClick={() => toggleDispositivo(d.id)}
                  >
                    {d.nome}
                  </button>
                ))}
              </div>
            </div>

            <div className="acf__field">
              <span className="acf__label">Quem é barrado</span>
              <div className="acf__seg" role="group" aria-label="Ação ao barrar">
                {ACOES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="acf__seg-btn"
                    data-on={regra.acao === a.id}
                    onClick={() => alterar({ acao: a.id })}
                  >
                    {a.nome}
                  </button>
                ))}
              </div>
              {regra.acao === "redirect" && (
                <label className="acf__inline-field">
                  <span className="acf__label">Para onde redirecionar</span>
                  <input
                    className="acf__input"
                    value={regra.redirectUrl}
                    maxLength={2048}
                    placeholder="https://sualoja.com/indisponivel"
                    onChange={(e) => alterar({ redirectUrl: e.target.value })}
                  />
                </label>
              )}
            </div>
          </section>

          {/* ── Coluna do simulador ─────────────────────────────────── */}
          <section className="acf__card">
            <div className="acf__card-head">Simulador — quem entra?</div>
            <p className="acf__sim-lead">
              Escolha um visitante e veja o que a regra faz com ele.
            </p>

            <div className="acf__field">
              <label className="acf__inline-field">
                <span className="acf__label">País do visitante</span>
                <select
                  className="acf__select"
                  value={visitante.pais}
                  onChange={(e) =>
                    setVisitante((v) => ({ ...v, pais: e.target.value }))
                  }
                >
                  {PAISES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.flag} {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="acf__inline-field">
                <span className="acf__label">Aparelho do visitante</span>
                <select
                  className="acf__select"
                  value={visitante.dispositivo}
                  onChange={(e) =>
                    setVisitante((v) => ({
                      ...v,
                      dispositivo: e.target.value as DeviceKind,
                    }))
                  }
                >
                  {DISPOSITIVOS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className="acf__verdict"
              role="status"
              data-ok={veredito.permitido}
            >
              <span className="acf__verdict-mark" aria-hidden>
                {veredito.permitido ? "✓" : "✕"}
              </span>
              <div className="acf__verdict-body">
                <b>
                  {veredito.permitido
                    ? "Vê a página"
                    : "Não vê — é barrado"}
                </b>
                <span>
                  {nomeDoPais(visitante.pais)} ·{" "}
                  {nomeDoDispositivo(visitante.dispositivo)}
                </span>
                <span className="acf__verdict-why">{veredito.motivo}</span>
                {!veredito.permitido && (
                  <span className="acf__verdict-action">
                    {descreverAcao(regra)}
                  </span>
                )}
              </div>
            </div>

            <div className="acf__fair">
              O revisor de anúncio que entrar por{" "}
              {nomeDoPais(visitante.pais)} no{" "}
              {nomeDoDispositivo(visitante.dispositivo).toLowerCase()} vê{" "}
              <b>exatamente isto</b> — nada é escondido só dele.
            </div>
          </section>
        </div>

        <p className="acf__note">
          <b>Demonstração:</b> esta tela é só a interface — a regra não está
          ligada em nenhum servidor. Quando estiver, ela vale por igual para
          qualquer visitante; não serve para mostrar uma página ao revisor e
          outra à pessoa.
        </p>
      </div>
    </div>
  );
}
