"use client";

import { useActionState } from "react";
import { adicionarLead, type EstadoForm } from "../actions";

export default function FormularioLead({ nichos }: { nichos: string[] }) {
  const [estado, acao, enviando] = useActionState<EstadoForm, FormData>(
    adicionarLead,
    {},
  );

  return (
    <form action={acao}>
      <div className="formulario">
        <div className="campo">
          <label htmlFor="nome">Nome</label>
          <input id="nome" name="nome" required placeholder="Nome do contato" />
        </div>

        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" placeholder="contato@email.com" />
        </div>

        <div className="campo">
          <label htmlFor="telefone">Telefone</label>
          <input id="telefone" name="telefone" placeholder="(11) 90000-0000" />
        </div>

        <div className="campo">
          <label htmlFor="nicho">Nicho / operação</label>
          <input
            id="nicho"
            name="nicho"
            list="nichos-existentes"
            placeholder="Relógios"
          />
          <datalist id="nichos-existentes">
            {nichos.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <div className="campo">
          <label htmlFor="origem">Origem</label>
          <input id="origem" name="origem" placeholder="Instagram, indicação…" />
        </div>

        <div className="campo">
          <label htmlFor="valor_estimado">Valor estimado (R$)</label>
          <input id="valor_estimado" name="valor_estimado" inputMode="decimal" placeholder="0,00" />
        </div>

        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Adicionar lead"}
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
