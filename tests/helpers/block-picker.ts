import { fireEvent, screen } from "@testing-library/react";

/*
  Ajuda para os testes: as escolhas do painel são grupos de blocos
  (role="radiogroup"), não menus <select>. `picked` lê o valor escolhido e
  `pick` clica no bloco de um valor — abrindo a lista antes, quando a
  escolha está recolhida num único bloco.
*/

function shell(name: string): HTMLElement {
  const group = screen.queryByRole("radiogroup", { name });
  if (group) return group;
  const toggle = screen.getByRole("button", { name });
  return toggle.parentElement as HTMLElement;
}

export function picked(name: string): string {
  return shell(name).getAttribute("data-value") ?? "";
}

export function pick(name: string, value: string) {
  const toggle = screen.queryByRole("button", { name });
  if (toggle && toggle.getAttribute("aria-expanded") === "false") {
    fireEvent.click(toggle);
  }
  const group = screen.getByRole("radiogroup", { name });
  const block = group.querySelector<HTMLButtonElement>(
    `[data-value="${value}"]`,
  );
  if (!block) throw new Error(`Bloco "${value}" não existe em "${name}".`);
  fireEvent.click(block);
}

export function pickerDisabled(name: string): boolean {
  const group = screen.queryByRole("radiogroup", { name });
  if (group) return group.getAttribute("aria-disabled") === "true";
  return screen.getByRole("button", { name }).hasAttribute("disabled");
}
