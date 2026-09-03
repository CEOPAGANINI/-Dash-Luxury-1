import Cartao from "@/components/Cartao";
import { dataCurta, numero, reais } from "@/lib/format";
import { numerico } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { mudarStatusLead, removerLead } from "../actions";
import FormularioLead from "./FormularioLead";

export const metadata = { title: "Leads — Infinity" };
export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  nicho: string;
  origem: string | null;
  status: "novo" | "contatado" | "negociando" | "ganho" | "perdido";
  valor_estimado: number;
  criado_em: string;
};

const CORES: Record<Lead["status"], string> = {
  novo: "cinza",
  contatado: "ambar",
  negociando: "ambar",
  ganho: "verde",
  perdido: "vermelho",
};

const STATUS: Lead["status"][] = [
  "novo",
  "contatado",
  "negociando",
  "ganho",
  "perdido",
];

export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{ nicho?: string }>;
}) {
  const { nicho: filtro } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("leads")
    .select(
      "id, nome, email, telefone, nicho, origem, status, valor_estimado, criado_em",
    )
    .order("criado_em", { ascending: false })
    .limit(300);

  const todos = ((data ?? []) as Lead[]).map((l) => ({
    ...l,
    valor_estimado: numerico(l.valor_estimado),
  }));
  const nichos = [...new Set(todos.map((l) => l.nicho))].sort();
  const leads = filtro ? todos.filter((l) => l.nicho === filtro) : todos;

  const ganhos = leads.filter((l) => l.status === "ganho");
  const emAberto = leads.filter(
    (l) => l.status !== "ganho" && l.status !== "perdido",
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="olho">CRM</p>
          <h1>Banco de leads</h1>
          <p>
            Cada lead pertence a um nicho — o mesmo nome de nicho agrupa os
            contatos daquela operação. Use os atalhos abaixo para filtrar.
          </p>
        </div>
      </div>

      <section className="grade-cartoes">
        <Cartao rotulo="Leads na lista" valor={numero(leads.length)}>
          <span className="apoio">
            {filtro ? `Filtrando por ${filtro}` : "Todos os nichos"}
          </span>
        </Cartao>
        <Cartao rotulo="Em aberto" valor={numero(emAberto.length)}>
          <span className="apoio">Ainda dá pra fechar</span>
        </Cartao>
        <Cartao rotulo="Ganhos" valor={numero(ganhos.length)}>
          <span className="apoio">
            {reais(ganhos.reduce((t, l) => t + l.valor_estimado, 0))} fechados
          </span>
        </Cartao>
        <Cartao
          rotulo="Potencial em aberto"
          valor={reais(emAberto.reduce((t, l) => t + l.valor_estimado, 0))}
        />
      </section>

      {nichos.length > 0 && (
        <div className="abas" style={{ flexWrap: "wrap" }}>
          <a
            className="botao discreto"
            href="/painel/leads"
            aria-current={!filtro ? "page" : undefined}
          >
            Todos
          </a>
          {nichos.map((n) => (
            <a
              key={n}
              className="botao discreto"
              href={`/painel/leads?nicho=${encodeURIComponent(n)}`}
              aria-current={filtro === n ? "page" : undefined}
            >
              {n}
            </a>
          ))}
        </div>
      )}

      <section className="painel">
        <header>
          <h2>Novo lead</h2>
        </header>
        <FormularioLead nichos={nichos} />
      </section>

      <section className="painel">
        <header>
          <h2>Lista</h2>
          <p>{leads.length} lead(s)</p>
        </header>

        {leads.length === 0 ? (
          <p className="vazio">Nenhum lead nesta visão.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Nicho</th>
                  <th>Origem</th>
                  <th className="num">Valor</th>
                  <th>Status</th>
                  <th>Entrou</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>{l.nome}</td>
                    <td>
                      <span className="mono" style={{ fontSize: "0.78rem" }}>
                        {l.email ?? l.telefone ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className="tag cinza">{l.nicho}</span>
                    </td>
                    <td>{l.origem ?? "—"}</td>
                    <td className="num">{reais(l.valor_estimado)}</td>
                    <td>
                      <form action={mudarStatusLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <select
                          name="status"
                          defaultValue={l.status}
                          aria-label={`Status de ${l.nome}`}
                          className={`tag ${CORES[l.status]}`}
                          style={{ width: "auto", padding: "0.25rem 0.4rem" }}
                        >
                          {STATUS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button className="botao perigo" type="submit">
                          Salvar
                        </button>
                      </form>
                    </td>
                    <td className="mono tabular" style={{ fontSize: "0.78rem" }}>
                      {dataCurta(l.criado_em)}
                    </td>
                    <td className="num">
                      <form action={removerLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          className="botao perigo"
                          type="submit"
                          aria-label={`Apagar ${l.nome}`}
                        >
                          Apagar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
