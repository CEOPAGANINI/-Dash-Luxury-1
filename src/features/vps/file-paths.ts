/*
  Caminhos de arquivo do Servidor do Funil.

  Veio do painel VPS anterior sem mudança de lógica. A contenção de verdade
  (lstat, raiz fixa /var/www/dash-funil, nunca seguir link) é do agente na
  VPS; aqui só se recusa o que nunca poderia ser um caminho relativo limpo,
  e o limite do ZIP é o mesmo nos dois lados.
*/

export const VPS_UPLOAD_MAX_BYTES = 3_000_000;

/** Relative paths only; never shell syntax or a second filesystem root. */
export function normalizeVpsRelativePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("Caminho de pasta inválido.");
  }
  if (value === "") return "";
  const parts = value.split("/");
  if (
    parts.some(
      (part) => !part || part === "." || part === ".." || part.length > 255,
    )
  ) {
    throw new Error("Escolha uma pasta dentro da raiz cadastrada.");
  }
  return parts.join("/");
}
