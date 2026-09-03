import Cartao from "@/components/Cartao";
import Delta from "@/components/Delta";
import GraficoBarras from "@/components/GraficoBarras";
import { dataCurta, multiplicador, numero, porcentagem, reais } from "@/lib/format";
import {
  hojeISO,
  metricasCampanhas,
  resumoPorPeriodo,
  serieDiaria,
  somarDias,
  normalizarCampanhas,
  normalizarMovimentos,
} from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Visão geral — Infinity" };
export const dynamic = "force-dynamic";

export default async function VisaoGeral() {
  const supabase = await createClient();
  const hoje = hojeISO();

  const [{ data: movimentos }, { data: campanhas }] = await Promise.all([
    supabase
      .from("movimentos")
      .select("id, tipo, categoria, descricao, valor, data")
      .gte("data", somarDias(hoje, -60))
      .order("data", { ascending: false }),
    supabase
      .from("campanhas")
      .select(
        "id, nome, plataforma, status, investimento, receita, leads_gerados, vendas, inicio, fim",
      )
      .eq("status", "ativa"),
  ]);

  const lancamentos = normalizarMovimentos(movimentos ?? []);
  const ativas = normalizarCampanhas(campanhas ?? []);

  const resumos = resumoPorPeriodo(lancamentos, hoje);
  const serie = serieDiaria(lancamentos, 30, hoje);
  const anuncios = metricasCampanhas(ativas);
  const semDados = lancamentos.length === 0 && ativas.length === 0;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="olho">Operação</p>
          <h1>Visão geral</h1>
          <p>
            Lucro é entradas menos saídas. A seta compara com o período
            imediatamente anterior do mesmo tamanho.
          </p>
        </div>
      </div>

      {semDados && (
        <p className="aviso info">
          O painel ainda não tem lançamentos. Comece em{" "}
          <strong>Entradas e saídas</strong> — os números abaixo são reais e
          ficam em zero até você registrar o primeiro movimento. Nada aqui é
          exemplo inventado.
        </p>
      )}

      <section className="grade-cartoes">
        {resumos.map((r) => (
          <Cartao key={r.rotulo} rotulo={`Lucro · ${r.rotulo}`} valor={reais(r.lucro)}>
            <Delta valor={r.variacao} />
            <span className="apoio tabular">
              {reais(r.entradas)} entrou · {reais(r.saidas)} saiu
            </span>
          </Cartao>
        ))}
      </section>

      <section className="painel">
        <header>
          <h2>Movimento por dia</h2>
          <p>Últimos 30 dias</p>
        </header>
        <GraficoBarras pontos={serie} />
      </section>

      <section className="painel">
        <header>
          <h2>Retorno dos anúncios</h2>
          <p>Somando as campanhas marcadas como ativas</p>
        </header>

        {ativas.length === 0 ? (
          <p className="vazio">
            Nenhuma campanha ativa. Cadastre em <strong>Campanhas</strong> para
            ver ROAS, ROI e CPA.
          </p>
        ) : (
          <div className="grade-cartoes">
            <Cartao
              rotulo="ROAS"
              valor={anuncios.roas === null ? "—" : multiplicador(anuncios.roas)}
            >
              <span className="apoio">
                Cada R$ 1 investido virou{" "}
                {anuncios.roas === null ? "—" : reais(anuncios.roas)} de receita
              </span>
            </Cartao>
            <Cartao
              rotulo="ROI"
              valor={anuncios.roi === null ? "—" : porcentagem(anuncios.roi)}
            >
              <span className="apoio">Lucro sobre o que foi investido</span>
            </Cartao>
            <Cartao
              rotulo="CPA"
              valor={anuncios.cpa === null ? "—" : reais(anuncios.cpa)}
            >
              <span className="apoio">
                Custo de cada venda · {numero(anuncios.vendas)} venda(s)
              </span>
            </Cartao>
            <Cartao
              rotulo="Lucro por venda"
              valor={
                anuncios.lucroPorCpa === null ? "—" : reais(anuncios.lucroPorCpa)
              }
            >
              <span className="apoio">O que sobra depois do CPA</span>
            </Cartao>
          </div>
        )}
      </section>

      <section className="painel">
        <header>
          <h2>Últimos lançamentos</h2>
          <p>10 mais recentes</p>
        </header>

        {lancamentos.length === 0 ? (
          <p className="vazio">Nada registrado ainda.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.slice(0, 10).map((m) => (
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
