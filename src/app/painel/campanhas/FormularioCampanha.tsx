"use client";

import { useActionState } from "react";
import { adicionarCampanha, type EstadoForm } from "../actions";

export default function FormularioCampanha() {
  const [estado, acao, enviando] = useActionState<EstadoForm, FormData>(
    adicionarCampanha,
    {},
  );

  return (
    <form action={acao}>
      <div className="formulario">
        <div className="campo">
          <label htmlFor="nome">Nome</label>
          <input id="nome" name="nome" required placeholder="Black Friday relógios" />
        </div>

        <div className="campo">
          <label htmlFor="plataforma">Plataforma</label>
          <select id="plataforma" name="plataforma" defaultValue="Facebook Ads">
            <option>Facebook Ads</option>
            <option>Google Ads</option>
            <option>TikTok Ads</option>
            <option>Orgânico</option>
            <option>Outro</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue="ativa">
            <option value="ativa">Ativa</option>
            <option value="pausada">Pausada</option>
            <option value="encerrada">Encerrada</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="investimento">Investido (R$)</label>
          <input id="investimento" name="investimento" inputMode="decimal" placeholder="0,00" />
        </div>

        <div className="campo">
          <label htmlFor="receita">Receita (R$)</label>
          <input id="receita" name="receita" inputMode="decimal" placeholder="0,00" />
        </div>

        <div className="campo">
          <label htmlFor="leads_gerados">Leads</label>
          <input id="leads_gerados" name="leads_gerados" type="number" min={0} defaultValue={0} />
        </div>

        <div className="campo">
          <label htmlFor="vendas">Vendas</label>
          <input id="vendas" name="vendas" type="number" min={0} defaultValue={0} />
        </div>

        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Adicionar"}
        </button>
      </div>

      {estado.erro && (
        <p className="aviso erro" style={{ marginTop: "0.9rem" }}>
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p className="aviso info" style={{ marginTop: "0.9rem" }}>
          {estado.ok}
        </p>
      )}
    </form>
  );
}
