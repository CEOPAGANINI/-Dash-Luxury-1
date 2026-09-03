"use client";

import { useActionState } from "react";
import { adicionarMovimento, type EstadoForm } from "../actions";

export default function FormularioMovimento({ hoje }: { hoje: string }) {
  const [estado, acao, enviando] = useActionState<EstadoForm, FormData>(
    adicionarMovimento,
    {},
  );

  return (
    <form action={acao}>
      <div className="formulario">
        <div className="campo">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" defaultValue="entrada">
            <option value="entrada">Entrada (dinheiro que chega)</option>
            <option value="saida">Saída (dinheiro que sai)</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="descricao">Descrição</label>
          <input
            id="descricao"
            name="descricao"
            required
            placeholder="Venda relógio / Anúncio Meta"
          />
        </div>

        <div className="campo">
          <label htmlFor="categoria">Categoria</label>
          <input id="categoria" name="categoria" placeholder="Geral" />
        </div>

        <div className="campo">
          <label htmlFor="valor">Valor (R$)</label>
          <input
            id="valor"
            name="valor"
            inputMode="decimal"
            required
            placeholder="1200,00"
          />
        </div>

        <div className="campo">
          <label htmlFor="data">Data</label>
          <input id="data" name="data" type="date" defaultValue={hoje} />
        </div>

        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Registrar"}
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
