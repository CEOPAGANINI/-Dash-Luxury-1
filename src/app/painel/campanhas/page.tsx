import Cartao from "@/components/Cartao";
import { multiplicador, numero, porcentagem, reais } from "@/lib/format";
import { metricasCampanhas, normalizarCampanhas, type Campanha } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { removerCampanha } from "../actions";
import FormularioCampanha from "./FormularioCampanha";

export const metadata = { title: "Campanhas — Infinity" };
export const dynamic = "force-dynamic";

const CORES: Record<Campanha["status"], string> = {
  ativa: "verde",
  pausada: "ambar",
  encerrada: "cinza",
};

export default async function Campanhas() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("campanhas")
    .select(
      "id, nome, plataforma, status, investimento, receita, leads_gerados, vendas, inicio, fim",
    )
    .order("inicio", { ascending: false });

  const campanhas = normalizarCampanhas(data ?? []);
  const total = metricasCampanhas(campanhas);

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="olho">Aquisição</p>
          <h1>Campanhas</h1>
          <p>
            Enquanto não houver integração automática com Facebook e Google, os
            valores investidos são digitados aqui. As contas (ROAS, ROI, CPA)
            saem sozinhas do que você digitar.
          </p>
        </div>
      </div>

      <section className="grade-cartoes">
        <Cartao rotulo="Investido" valor={reais(total.investimento)} />
        <Cartao rotulo="Receita" valor={reais(total.receita)} />
        <Cartao rotulo="ROAS" valor={total.roas === null ? "—" : multiplicador(total.roas)}>
          <span className="apoio">Receita ÷ investimento</span>
        </Cartao>
        <Cartao rotulo="ROI" valor={total.roi === null ? "—" : porcentagem(total.roi)}>
          <span className="apoio">Lucro sobre o investido</span>
        </Cartao>
        <Cartao rotulo="CPA" valor={total.cpa === null ? "—" : reais(total.cpa)}>
          <span className="apoio">{numero(total.vendas)} venda(s)</span>
        </Cartao>
      </section>

      <section className="painel">
        <header>
          <h2>Nova campanha</h2>
        </header>
        <FormularioCampanha />
      </section>

      <section className="painel">
        <header>
          <h2>Todas as campanhas</h2>
          <p>{campanhas.length} cadastrada(s)</p>
        </header>

        {campanhas.length === 0 ? (
          <p className="vazio">Nenhuma campanha cadastrada ainda.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Plataforma</th>
                  <th>Status</th>
                  <th className="num">Investido</th>
                  <th className="num">Receita</th>
                  <th className="num">ROAS</th>
                  <th className="num">CPA</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const m = metricasCampanhas([c]);
                  return (
                    <tr key={c.id}>
                      <td>{c.nome}</td>
                      <td>{c.plataforma}</td>
                      <td>
                        <span className={`tag ${CORES[c.status]}`}>{c.status}</span>
                      </td>
                      <td className="num">{reais(c.investimento)}</td>
                      <td className="num">{reais(c.receita)}</td>
                      <td className="num">
                        {m.roas === null ? "—" : multiplicador(m.roas)}
                      </td>
                      <td className="num">{m.cpa === null ? "—" : reais(m.cpa)}</td>
                      <td className="num">
                        <form action={removerCampanha}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            className="botao perigo"
                            type="submit"
                            aria-label={`Apagar ${c.nome}`}
                          >
                            Apagar
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
