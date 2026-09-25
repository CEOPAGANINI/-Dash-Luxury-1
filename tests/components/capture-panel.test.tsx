// @vitest-environment jsdom
import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CapturePanel } from "@/features/capture/capture-panel";

/*
  A tela do Asimov Site Downloader é só demonstração: um endereço válido
  encena o log e a barra de sucesso avisando que nada foi baixado; nenhuma
  chamada de rede sai; um endereço inválido nem começa a encenação.
*/

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Asimov Site Downloader (demonstração)", () => {
  it("encena a captura e avisa que nada foi baixado, sem chamar a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<CapturePanel />);
    fireEvent.change(screen.getByLabelText("Endereço da página"), {
      target: { value: "exemplo.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Baixar página/ }));

    await waitFor(
      () =>
        expect(screen.getByRole("status").textContent).toMatch(
          /nada foi baixado de verdade/,
        ),
      { timeout: 4000 },
    );
    expect(screen.getByText(/demonstração — a captura não está ligada/)).toBeTruthy();
    expect(screen.getByText(/concluído · exemplo\.com\.zip/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não encena nada com um endereço inválido", () => {
    render(<CapturePanel />);
    fireEvent.change(screen.getByLabelText("Endereço da página"), {
      target: { value: "http://localhost/x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Baixar página/ }));
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
