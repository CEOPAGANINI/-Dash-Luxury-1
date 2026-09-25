"use client";

import * as React from "react";
import { Moon, Percent, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

import { useTaxas } from "@/features/ads/fees-store";
import { COFRES_LOCAIS } from "./servicos";

/*
  As preferências que vivem neste navegador, nos cartões do DevMode:
  o tema do painel (next-themes), a taxa do gateway que o cálculo de
  lucro das campanhas usa (fees-store) e a limpeza das arrumações
  locais. Nada aqui toca o banco.
*/

export function CartaoDoTema() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o tema só é conhecido no navegador
    setMontado(true);
  }, []);
  const branco = montado && theme === "branco";
  return (
    <div className="cfg-card">
      <div className="cfg-card-topo">
        <div className="cfg-card-titulo">
          <span className="cfg-icone" aria-hidden="true">
            {branco ? <Sun /> : <Moon />}
          </span>
          <div>
            <h3>Tema do painel</h3>
            <p>Vale em todas as páginas e fica guardado neste navegador.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={branco}
          aria-label={
            branco
              ? "Tema branco ativo. Trocar para o tema preto."
              : "Tema preto ativo. Trocar para o tema branco."
          }
          className="cfg-toggle"
          data-ligado={branco ? "true" : "false"}
          onClick={() => setTheme(branco ? "preto" : "branco")}
        >
          <i aria-hidden="true" />
        </button>
      </div>
      <p className="cfg-card-valor">
        <span>Ativo</span>
        <code>{montado ? (branco ? "branco" : "preto") : "…"}</code>
      </p>
    </div>
  );
}

export function CartaoDaTaxa() {
  const { gatewayPercentual, notice, definirGateway } = useTaxas();
  const [texto, setTexto] = React.useState<string | null>(null);
  const mostrado = texto ?? String(gatewayPercentual).replace(".", ",");
  const aplicar = () => {
    if (texto === null) return;
    definirGateway(Number(texto.replace(",", ".")) || 0);
    setTexto(null);
  };
  return (
    <div className="cfg-card">
      <div className="cfg-card-topo">
        <div className="cfg-card-titulo">
          <span className="cfg-icone" aria-hidden="true">
            <Percent />
          </span>
          <div>
            <h3>Taxa do gateway</h3>
            <p>
              Entra no lucro de cada campanha: retorno − taxa − tráfego. A mesma
              taxa da página Gateways.
            </p>
          </div>
        </div>
      </div>
      <div className="cfg-campo">
        <label htmlFor="cfg-taxa">Porcentagem sobre o retorno (0 a 100)</label>
        <div className="cfg-campo-linha">
          <input
            id="cfg-taxa"
            inputMode="decimal"
            value={mostrado}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={aplicar}
            onKeyDown={(e) => {
              if (e.key === "Enter") aplicar();
            }}
          />
          <span aria-hidden="true">%</span>
        </div>
        {notice && <p className="cfg-aviso-campo">{notice}</p>}
      </div>
    </div>
  );
}

export function CartaoDosDadosLocais() {
  const [guardados, setGuardados] = React.useState<number | null>(null);
  const [confirmando, setConfirmando] = React.useState(false);
  const [feito, setFeito] = React.useState(false);
  const contar = React.useCallback(() => {
    try {
      setGuardados(
        COFRES_LOCAIS.filter((c) => localStorage.getItem(c.chave) !== null)
          .length,
      );
    } catch {
      setGuardados(null);
    }
  }, []);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o localStorage só existe no navegador
    contar();
  }, [contar]);
  const limpar = () => {
    try {
      for (const c of COFRES_LOCAIS) localStorage.removeItem(c.chave);
    } catch {
      // Sem armazenamento não há o que limpar.
    }
    setConfirmando(false);
    setFeito(true);
    contar();
  };
  return (
    <div className="cfg-card cfg-card-perigo">
      <div className="cfg-card-topo">
        <div className="cfg-card-titulo">
          <span className="cfg-icone" aria-hidden="true">
            <Trash2 />
          </span>
          <div>
            <h3>Arrumações deste navegador</h3>
            <p>
              Tags, tamanhos de blocos, notas, ordens e filtros — {""}
              {guardados === null
                ? "armazenamento indisponível"
                : `${guardados} de ${COFRES_LOCAIS.length} cofres em uso`}
              . Limpar volta tudo ao padrão; os dados do banco não mudam.
            </p>
          </div>
        </div>
        {confirmando ? (
          <span className="cfg-confirmar">
            <button type="button" className="cfg-botao-perigo" onClick={limpar}>
              Apagar mesmo
            </button>
            <button
              type="button"
              className="cfg-botao"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="cfg-botao cfg-botao-perigoso"
            disabled={guardados === 0}
            onClick={() => {
              setFeito(false);
              setConfirmando(true);
            }}
          >
            Limpar arrumações
          </button>
        )}
      </div>
      {feito && (
        <p role="status" className="cfg-card-valor">
          <span>Feito</span>
          <code>arrumações apagadas; recarregue as páginas abertas</code>
        </p>
      )}
    </div>
  );
}
