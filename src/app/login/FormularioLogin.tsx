"use client";

import { useActionState, useState } from "react";
import { cadastrar, entrar, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = {};

export default function FormularioLogin() {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [estadoEntrar, acaoEntrar, entrando] = useActionState(entrar, inicial);
  const [estadoCriar, acaoCriar, criando] = useActionState(cadastrar, inicial);

  const criandoConta = modo === "criar";
  const estado = criandoConta ? estadoCriar : estadoEntrar;
  const ocupado = criandoConta ? criando : entrando;

  return (
    <form className="caixa-login" action={criandoConta ? acaoCriar : acaoEntrar}>
      <div>
        <p className="olho">Infinity</p>
        <h1>{criandoConta ? "Criar conta" : "Entrar no painel"}</h1>
        <p className="sub">
          {criandoConta
            ? "Sua conta é individual: só você enxerga os seus números."
            : "Use o e-mail e a senha cadastrados."}
        </p>
      </div>

      <div className="abas">
        <button
          type="button"
          aria-pressed={!criandoConta}
          onClick={() => setModo("entrar")}
        >
          Entrar
        </button>
        <button
          type="button"
          aria-pressed={criandoConta}
          onClick={() => setModo("criar")}
        >
          Criar conta
        </button>
      </div>

      <div className="pilha">
        {criandoConta && (
          <div className="campo">
            <label htmlFor="nome">Seu nome</label>
            <input
              id="nome"
              name="nome"
              autoComplete="name"
              placeholder="Como quer ser chamado"
            />
          </div>
        )}

        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="voce@email.com"
          />
        </div>

        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            minLength={6}
            autoComplete={criandoConta ? "new-password" : "current-password"}
            placeholder="pelo menos 6 caracteres"
          />
        </div>
      </div>

      {estado.erro && <p className="aviso erro">{estado.erro}</p>}
      {estado.aviso && <p className="aviso info">{estado.aviso}</p>}

      <button className="botao" type="submit" disabled={ocupado}>
        {ocupado ? "Aguarde…" : criandoConta ? "Criar minha conta" : "Entrar"}
      </button>
    </form>
  );
}
