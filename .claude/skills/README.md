# Skills de design do Dash Luxury

Habilidades de agente instaladas neste repositório. Ficam em `.claude/skills/`,
então o Claude Code carrega sozinho quando o assunto bate com a descrição de cada
uma — não é preciso chamar pelo nome.

Origem das dez primeiras: catálogo público de agent skills do Aura Build
(github.com/MengTo/skills, licença no repositório de origem). Copiamos só o texto
(`SKILL.md`, `REFERENCES.md`, `ARTICLE.md`, `agents/`, `demo/PROMPT.md`,
`demo/index.html`, `demo/source.json`) e deixamos de fora imagens e vídeos de
demonstração, para o repositório não engordar.

## As dez escolhidas, e por que cada uma serve a este painel

| # | Skill | Para que serve aqui |
| --- | --- | --- |
| 1 | `no-ai-design-slop` | Trava contra o visual genérico de IA: gradiente roxo, emoji de enfeite, card flutuando sem motivo. |
| 2 | `audit-ai-design-slop` | Auditoria de tela pronta: aponta onde o desenho caiu no genérico. |
| 3 | `design-first-ui-prompting` | Decidir o desenho antes de escrever código, em vez de refatorar depois. |
| 4 | `skeuomorphic-ui` | O soquete oco e a lâmpada acesa das linhas de posicionamento: gradiente em camadas, sombra interna, borda que reflete. |
| 5 | `beautiful-shadows` | O painel inteiro é bloco sobre bloco; aqui está a receita de sombra que dá camada sem sujeira. |
| 6 | `number-details` | Painel de anúncios é número: ROAS, CPA, CPC. Trata algarismo como tipografia, não como texto solto. |
| 7 | `nested-container-frames` | Bloco dentro de bloco dentro de seção — exatamente a estrutura do painel da direita. |
| 8 | `reveal-hover-effect` | As métricas de posicionamento aparecem ao passar o mouse; aqui está como fazer isso sem sobressalto. |
| 9 | `dark-glass-clean-layout` | O Orbit é escuro com superfícies grafite; esta é a gramática de vidro/profundidade no escuro. |
| 10 | `tailwindcss` | A pilha real do projeto é Tailwind 4; evita brigar com o utilitário. |

## Extra, feita aqui

| Skill | Para que serve |
| --- | --- |
| `extrair-design-system` | Transforma um HTML de referência em `design-system.html`: uma página só, com hero clonado, tipografia, cores, componentes, layout, movimento e ícones — reaproveitando as classes originais, sem redesenhar. Vem do prompt "Extract HTML Design System v2"; o texto original está em `extrair-design-system/PROMPT-ORIGINAL.md`. |
