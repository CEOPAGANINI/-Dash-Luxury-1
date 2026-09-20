# Aquisição: páginas e contrato de dados

A rota `/dashboard/trafego` inicia no Calendário e possui páginas internas
exclusivas, uma por elemento: Calendário, Horário de pico, Dia da semana, Melhor
semana, Melhor quinzena, Dias das quinzenas, Canais, Resumo, Funil de tráfego,
Público e Criativos. Esta granularidade segue a instrução final do usuário,
substituindo o agrupamento inicial em quatro páginas. O provedor existente
preserva mês, ano, canal e dia; as opções de comparação e visualização pertencem
ao componente pai, nunca a uma página que possa ser desmontada. A métrica de
padrões e a janela histórica também são compartilhadas. Diagnósticos antigos
continuam em `/dashboard/trafego/diagnosticos` e não recebem o novo modelo. Os
módulos de funil, público e criativos aguardam granularidade real; em modo real
exibem indisponibilidade, sem distribuir sinteticamente os totais.

O Calendário começa diretamente na grade e na faixa de eficiência. O cabeçalho,
os filtros e a barra de controles acima da grade foram removidos a pedido.
Os filtros seguem acessíveis nas demais páginas e são preservados ao retornar.

Os detalhes são uma prévia flutuante aberta ao passar o mouse ou focar um dia,
tanto na grade quanto na faixa de eficiência. Isso não seleciona o dia nem altera
os filtros. Clique/toque continua disponível para selecionar e inspecionar; não
existe coluna lateral de detalhes. A prévia tem dimensões limitadas à tela,
rolagem interna quando necessária, fechamento por Escape/fora e permanece aberta
ao mover o ponteiro para seu conteúdo. Ao trocar de página ou semana, ela fecha.

Cada semana tem sete datas legíveis, incluindo os dias dos meses vizinhos nas
extremidades. O mês abreviado identifica esses dias, que também permitem consulta.
Registros existentes dos dias vizinhos podem aparecer, mas não são somados à faixa
de eficiência nem aos indicadores do mês selecionado. Dias futuros e datas sem
registro continuam explicitamente identificados; completar a grade não cria vendas.

## Fonte em produção

Por solicitação expressa do usuário, a rota exibe `AcquisitionDemoBoard`, com
dados determinísticos e o rótulo “Dados de exemplo”. Não são resultados da empresa
e não são gravados em banco. O cenário usa o fim do mês selecionado como data
simulada (`demoAsOf`), inclusive para permitir visualizar meses futuros.

O `TrafficBoard` real continua sem adaptador diário de vendas/mídia: sua fonte
padrão é `UNAVAILABLE_ACQUISITION_SOURCE`, sem registros. Não há fallback silencioso
de dados reais para fictícios. Fonte `mode: "demo"` é explicitamente diferenciada
e usa `attributionVerified: false`. Funil, público e criativos demonstrativos são
cenários separados, identificados como independentes dos totais do calendário.
No modo real, falta de registro é “Sem dados”, não receita zero; padrões sem
evidência são “Histórico insuficiente”.

## Integração necessária

Um adaptador autorizado deve passar `AcquisitionDataSource` ao `TrafficBoard`:

- `operationId`: operação do provedor compartilhado; dados de outra operação não
  são exibidos.
- `mode`: `live` (ou ausente) exige atribuição verificada; `demo` autoriza somente
  apresentação explicitamente rotulada de exemplos. `demoAsOf` é ignorado no modo real.
- `status`: loading, error, unavailable ou ready. A interface trata cada estado.
- `records`: um `AcquisitionDailyRecord` por data local da conta e canal. Duplicatas
  do mesmo dia/canal são substituições do agregado, não vendas adicionais.
- `attributionVerified`: só true após deduplicar pedidos no checkout e atribuir
  cada pedido a exatamente um canal. Nunca somar conversões brutas das plataformas.
- `timeZone`: identificador IANA real da conta. Na ausência, a interface informa
  explicitamente o fuso de referência America/Sao_Paulo.
- `sourceName`, `updatedAt`, `attributionModel`: procedência, atualização e regra
  efetivamente utilizadas, sem afirmar sincronização inexistente.
- `roasTarget`: meta efetivamente configurada; ausência não cria uma meta fictícia.

Cada registro deve informar data `YYYY-MM-DD`, canal, receita atribuída recebida,
pendente, recusada, investimento e quantidade de vendas. Valor `null` indica campo
desconhecido; zero indica zero confirmado. Quantidade de novos clientes é opcional
e condiciona CAC; sem ela mostramos CPA. `hourly` contém 24 valores de receita
atribuída e `hourlyOrders` 24 quantidades de vendas, agregadas no fuso da conta.
Sem granularidade horária, o gráfico não é estimado. `status` identifica parcial
ou consolidado; campanhas só são disponibilizadas quando há IDs reais no registro.

## Regras de cálculo

ROAS = soma da receita atribuída / soma do investimento. CPA = investimento /
vendas. CAC = investimento / novos clientes. Campos ausentes ou denominador zero
produzem indisponibilidade, nunca infinito/NaN. Cobertura parcial é informada.

As faixas existentes de ROAS são preservadas com intervalos exclusivos:
menor que 1; de 1 a menos de 1,15; de 1,15 a menos de 1,40; de 1,40 a menos de
1,80; a partir de 1,80. Não são chamadas de lucro ou equilíbrio financeiro.
Calendário, barra e detalhes usam o mesmo classificador. Dias futuros não recebem
classificação negativa e são excluídos dos cálculos de realizado.

Comparações de volume entre períodos usam média por dia com registro e mostram
cobertura. Razões usam seus totais. Base anterior zero deixa a variação percentual
não calculável. Padrões recorrentes exigem histórico independente, mostram a janela
30/60/90 dias, a métrica, amostras, empates e cobertura; semana/quinzena usam o mês
selecionado e médias diárias para evitar favorecimento por duração.

O gerador de demonstração possui testes de determinismo, cobertura e consistência
entre totais diários e horários. Os testes da fonte real continuam garantindo que
ausência, erro ou atribuição não verificada jamais sejam preenchidos com exemplos.
