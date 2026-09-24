import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MedidasDoServidor } from "@/features/vps/medidas-do-servidor";
import type { LeituraDTO, ServidorDTO } from "@/features/vps/modelo";

/*
  A saúde do servidor nas formas do Capital Overview: sempre COM total
  (sem ele, uma fatia sozinha vira 100%), cor de alerta só em leitura de
  até 10 min e "—" quando não há valor — nunca "Saudável" nem "Crítico".
*/

afterEach(cleanup);

const GB = 1024 ** 3;
const AGORA = "2026-09-23T21:12:00.000Z";
const ONLINE: ServidorDTO["sinal"] = {
  tipo: "online",
  ultimoPulsoEm: "2026-09-23T21:11:50.000Z",
};

function leitura(extra: Partial<LeituraDTO> = {}): LeituraDTO {
  return {
    em: "2026-09-23T21:10:00.000Z",
    cpuPercent: 12.5,
    cpuCores: 2,
    memoria: { usadoBytes: 1 * GB, totalBytes: 4 * GB },
    disco: { usadoBytes: 20 * GB, totalBytes: 40 * GB },
    uptimeSegundos: 3 * 86_400 + 5 * 3_600,
    avisos: [],
    ...extra,
  };
}

function larguras(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "[style*='--cor'][style*='width']",
    ),
  ].map((e) => ({
    largura: e.style.width,
    cor: e.style.getPropertyValue("--cor"),
  }));
}

describe("MedidasDoServidor", () => {
  it("disco pela metade é 50% da rosca, e não o círculo inteiro", () => {
    render(
      <MedidasDoServidor
        leitura={leitura()}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Disco /: Usado 50%" }),
    ).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("de 40 GB")).toBeTruthy();
  });

  it("memória e CPU são parte do total: a barra não enche sozinha", () => {
    const { container } = render(
      <MedidasDoServidor
        leitura={leitura()}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Memória: Usada de 4 GB 25%" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "CPU (amostra de 1 s): Uso 12,5%" }),
    ).toBeTruthy();
    expect(larguras(container).map((l) => l.largura)).toEqual(["25%", "12.5%"]);
    expect(screen.getAllByText("12,5%").length).toBeGreaterThan(0);
  });

  it("mostra última leitura, tempo ativo e núcleos", () => {
    render(
      <MedidasDoServidor
        leitura={leitura()}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(screen.getByText("23/09 18:10")).toBeTruthy();
    expect(screen.getByText("3 d 5 h")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("leitura recente acima de 90% ganha o tom negativo", () => {
    const { container } = render(
      <MedidasDoServidor
        leitura={leitura({
          memoria: { usadoBytes: 3.8 * GB, totalBytes: 4 * GB },
        })}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(larguras(container)[0]).toEqual({
      largura: "95%",
      cor: "var(--destructive)",
    });
  });

  it("disco acima de 75% (e até 90%) é atenção", () => {
    const { container } = render(
      <MedidasDoServidor
        leitura={leitura({
          disco: { usadoBytes: 32 * GB, totalBytes: 40 * GB },
        })}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    const fatias = container.querySelector<HTMLElement>("[style*='--fatias']");
    expect(fatias?.style.getPropertyValue("--fatias")).toContain(
      "var(--warning)",
    );
  });

  it("leitura com mais de 10 min fica sem tom e diz de quando é", () => {
    const { container } = render(
      <MedidasDoServidor
        leitura={leitura({
          em: "2026-09-23T20:00:00.000Z",
          memoria: { usadoBytes: 3.8 * GB, totalBytes: 4 * GB },
        })}
        erroLeitura={null}
        sinal={{ tipo: "sem_sinal", ultimoPulsoEm: "2026-09-23T20:01:00.000Z" }}
        agora={AGORA}
      />,
    );
    expect(larguras(container)[0].cor).toBe("var(--serie-1)");
    expect(
      screen.getByText("Sem sinal desde 17:01: valores da última leitura."),
    ).toBeTruthy();
  });

  it("sem leitura: três '—', e nenhum veredito inventado", () => {
    const { container } = render(
      <MedidasDoServidor
        leitura={null}
        erroLeitura={null}
        sinal={{ tipo: "nunca", ultimoPulsoEm: null }}
        agora={AGORA}
      />,
    );
    expect(screen.getByLabelText("Disco /: sem leitura").textContent).toBe("—");
    expect(screen.getByLabelText("Memória: sem leitura")).toBeTruthy();
    expect(
      screen.getByLabelText("CPU (amostra de 1 s): sem leitura"),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.textContent).not.toMatch(/Saudável|Crítico/);
    expect(
      screen.getByText(
        "O agente ainda não mandou nenhuma leitura deste servidor.",
      ),
    ).toBeTruthy();
  });

  it("medida com total zero não é desenhada", () => {
    render(
      <MedidasDoServidor
        leitura={leitura({
          disco: { usadoBytes: 0, totalBytes: 0 },
          cpuPercent: null,
        })}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(screen.getByLabelText("Disco /: sem leitura")).toBeTruthy();
    expect(
      screen.getByLabelText("CPU (amostra de 1 s): sem leitura"),
    ).toBeTruthy();
  });

  it("o erro da última leitura aparece, junto com os avisos dela", () => {
    render(
      <MedidasDoServidor
        leitura={leitura({ avisos: ["Serviço nginx não informado."] })}
        erroLeitura="formato inesperado"
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(
      screen.getByText(
        "A última leitura não pôde ser lida: formato inesperado",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Serviço nginx não informado.")).toBeTruthy();
  });

  it("compacto (cartão da lista): sem legenda, com a hora da leitura", () => {
    render(
      <MedidasDoServidor
        compacto
        leitura={leitura()}
        erroLeitura={null}
        sinal={ONLINE}
        agora={AGORA}
      />,
    );
    expect(screen.queryByText("Tempo ativo")).toBeNull();
    expect(screen.getByText("Última leitura: 18:10")).toBeTruthy();
  });
});
