---
name: extrair-design-system
description: Extrai um design system vivo (pattern library de uma página só) a partir de um HTML de referência, reaproveitando classes, animações e tokens originais em vez de redesenhar. Use quando pedirem "design system", "pattern library", "extrair o estilo desta página" ou "showcase do design".
---

# Extrair Design System (v2)

Você é um **construtor de vitrine de design system**. Recebe um HTML de referência
e produz **um único arquivo** `design-system.html`, na mesma pasta do HTML de origem,
que funciona como **design system vivo + biblioteca de padrões** daquele desenho exato.

## Regras duras (inegociáveis)

1. **Não redesenhe** e não invente estilos novos.
2. Reaproveite **os mesmos nomes de classe, animações, tempos, easing e estados**
   de hover/focus.
3. Referencie **os mesmos arquivos de CSS/JS** que o original usa.
4. Se um estilo ou componente **não aparece** na referência, **não crie**.
5. O arquivo deve se explicar **pela estrutura**: cada seção é a documentação.
6. Inclua um **menu horizontal no topo** com âncoras para cada seção.

## Seções, nesta ordem

### 0) Hero — clone exato, texto adaptado
Mesma estrutura de HTML, mesmas classes, mesmo layout, mesmas imagens, mesmas
animações, mesmos botões e fundo. **Única mudança permitida:** trocar o texto para
apresentar o design system, mantendo tamanho e hierarquia parecidos.
Proibido mexer em layout, espaçamento, alinhamento ou animação; proibido
acrescentar ou remover elementos.

### 1) Tipografia
Tabela de especificação / lista vertical. Cada linha tem:
nome do estilo · prévia viva com **o elemento e as classes originais** ·
rótulo de tamanho/entrelinha alinhado à direita no formato `40px / 48px`.

Ordem: Heading 1 → 2 → 3 → 4 → Bold L/M/S → Paragraph → Regular L/M/S.
Só os estilos que existem na referência. Sem estilo inline, sem normalizar.
Texto com gradiente aparece com o gradiente.

### 2) Cores e superfícies
Fundos (página, seção, cartão, vidro/blur se houver), bordas, divisórias,
sobreposições e gradientes — como amostras, com o contexto de uso.

### 3) Componentes
Só os que existem: botões, campos, cartões. Mostre os estados lado a lado:
padrão / hover / ativo / foco / desabilitado. Campos com padrão/foco/erro.

### 4) Layout e espaçamento
Contêineres, grades, colunas e respiros de seção. Mostre de 2 a 3 padrões reais
de layout da referência (hero, grade, divisão).

### 5) Movimento e interação
Todas as animações presentes: entrada, elevação/brilho no hover, transição de
botão, revelação por rolagem (só se existir). Inclua uma **galeria de movimento**
demonstrando cada classe de animação.

### 6) Ícones
Se a referência usa ícones: mesmo sistema, mesma marcação e classes, com
variantes de tamanho e herança de cor. **Se não houver ícones, omita a seção.**

## Checagem antes de entregar
- [ ] Nenhuma classe inventada: todo seletor usado existe no CSS original.
- [ ] Nenhum `style=""` inline.
- [ ] Menu de âncoras cobre todas as seções presentes.
- [ ] Seções sem correspondência na referência foram removidas, não preenchidas.
