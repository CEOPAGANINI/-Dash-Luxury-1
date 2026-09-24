/*
  Versão e impressões digitais dos arquivos que a VPS baixa.

  GERADO por scripts/vps/selar.mjs (npm run vps:selar): não edite à mão.
  O selar calcula o sha256 dos .py, injeta esses valores em
  public/agente/v1/instalar.sh e só então calcula o sha256 do instalador
  (que por isso muda sempre que um .py muda). Ele reescreve este arquivo
  inteiro, com estas mesmas quatro constantes.

  O comando de instalação mostrado no painel confere INSTALADOR_SHA256 com
  `sha256sum -c`; o instalador confere os dois .py. Isso garante que o
  arquivo chegou inteiro, NÃO protege contra um deploy comprometido (a
  tela e o docs/VPS.md dizem isso). tests/unit/vps-agente-versao.test.ts
  falha se estes valores divergirem dos arquivos.

  Antes da primeira selagem, os valores são o marcador de zeros.
*/

export const AGENTE_VERSAO = "1.0.0";
export const INSTALADOR_SHA256 =
  "15defe8a797778eb45d3d19c043e70e4528f40976934706352dcb0f2d1d6b3ba";
export const AGENTE_SHA256 =
  "afbc097ab4e409928931127d501b7ca3b5d37b24ad598f9914331d59ef83bbbf";
export const AGENTE_ROOT_SHA256 =
  "199dff8c3a7c954dd834b76401bec1de564daf6ada2fbf2b1197519b5e10f51f";
