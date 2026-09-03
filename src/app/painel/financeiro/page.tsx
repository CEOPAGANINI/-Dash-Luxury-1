import Cartao from "@/components/Cartao";
import { dataCurta, reais } from "@/lib/format";
import { hojeISO, normalizarMovimentos } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { removerMovimento } from "../actions";
import FormularioMovimento from "./FormularioMovimento";

export const metadata = { title: "Entradas e saídas — Infinity" };
export const dynamic = "force-dynamic";

export default async function Financeiro() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("movimentos")
    .select("id, tipo, categoria, descricao, valor, data")
    .order("data", { ascending: false })
    .limit(200);

  const movimentos = normalizarMovimentos(data ?? []);
  const entradas = movimentos
    .filter((m) => m.tipo === "entrada")
    .reduce((t, m) => t + m.valor, 0);
  const saidas = movimentos
    .filter((m) => m.tipo === "saida")
    .reduce((t, m) => t + m.valor, 0);

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="olho">Financeiro</p>
          <h1>Entradas e saídas</h1>
          <p>
            Todo dinheiro que entra e sai da operação. É daqui que a visão geral
            tira o lucro e as porcentagens.
          </p>
        </div>
      </div>

      <section className="grade-cartoes">
        <Cartao rotulo="Entrou (200 últimos)" valor={reais(entradas)} />
        <Cartao rotulo="Saiu (200 últimos)" valor={reais(saidas)} />
        <Cartao rotulo="Saldo" valor={reais(entradas - saidas)}>
          <span className="apoio">
            {entradas - saidas >= 0 ? "No azul" : "No vermelho"}
          </span>
        </Cartao>
      </section>

      <section className="painel">
        <header>
          <h2>Registrar movimento</h2>
          <p>Use vírgula para os centavos</p>
        </header>
        <FormularioMovimento hoje={hojeISO()} />
      </section>

      <section className="painel">
        <header>
          <h2>Histórico</h2>
          <p>{movimentos.length} lançamento(s)</p>
        </header>

        {movimentos.length === 0 ? (
          <p className="vazio">
            Nenhum lançamento ainda. Registre o primeiro no formulário acima.
          </p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="num">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => (
                  <tr key={m.id}>
                    <td className="mono tabular">{dataCurta(m.data)}</td>
                    <td>{m.descricao}</td>
                    <td>
                      <span className="tag cinza">{m.categoria}</span>
                    </td>
                    <td className="num">
                      <span
                        className={`tag ${m.tipo === "entrada" ? "verde" : "vermelho"}`}
                      >
                        {m.tipo === "entrada" ? "+" : "−"} {reais(m.valor)}
                      </span>
                    </td>
                    <td className="num">
                      <form action={removerMovimento}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          className="botao perigo"
                          type="submit"
                          aria-label={`Apagar ${m.descricao}`}
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
