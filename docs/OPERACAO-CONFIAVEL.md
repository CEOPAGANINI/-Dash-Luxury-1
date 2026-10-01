# Operação confiável — outubro de 2026

## Configuração pela interface

- `/configuracoes/operacao`: nome, moeda do relatório, fuso e contatos. A moeda filtra registros, não converte valores antigos.
- `/configuracoes/acessos`: equipe existente, funções e seleção da operação. Apenas proprietário/admin gerenciam acessos; somente o proprietário nomeia administradores. Não cria pessoas no Supabase Auth nem envia convites fictícios.
- `/configuracoes/diagnosticos`: leitura real do banco, presença de variáveis (sem valores), estrutura de salvamento/rastreamento e testes de leitura Meta/Shopify. O proprietário pode preparar as duas migrações aditivas registradas, sem SQL manual.
- `/configuracoes/pagamentos`: pagamentos, eventos assinados e conciliação por consulta ao Broski. Não cria cobranças nem efetua estornos.
- `/catalogo/produtos`, `/catalogo/categorias`, `/catalogo/estoque`: registros reais, controle de concorrência e movimentos de estoque transacionais.
- `/editor/landing-page`, `/editor/loja`: funis, páginas, loja, ZIPs, salvamento local/nuvem, histórico e recuperação.
- `/editor/checkout`: configura um checkout real vinculado a produto e métodos suportados.
- `/servidor`: cadastro, agente, sites, domínios e tarefas. Sem VPS cadastrada não existe servidor conectado.

## Garantias e limites

Dados privados exigem sessão validada e associação ativa à operação. O operador previamente configurado pode assumir somente a operação legada de sistema; outros usuários recebem operação própria. Um acesso suspenso não é reativado pela resolução automática.

Funis e ZIPs são isolados por usuário e operação. As gravações na nuvem usam revisão comparada, mantêm até 20 versões e não substituem silenciosamente um rascunho divergente. O armazenamento local anterior exige confirmação da operação antes de copiar e permanece preservado. Publicar um domínio gera um único pacote estático com páginas/ativos reais, até 3 MB, sem PHP ou `.htaccess`; URLs de checkout continuam dependendo do backend real.

As previsões do funil são estimativas, não vendas observadas. Divisão 90/10 é normalizada, arestas inativas não entram, ciclos são sinalizados. Regras que dependem de região/IP/rede bloqueiam exportação estática em vez de inventar um backend geográfico.

Checkout valida preço, moeda, produto e frete no servidor. O adaptador Broski suporta EUR, MB WAY e Multibanco, não assinaturas. Reserva de estoque e pedido precedem a cobrança, com tentativa estável. Após resultado incerto, o sistema concilia a mesma referência; não autoriza duplicação após a janela de idempotência do provedor. Webhooks assinados são idempotentes e conciliáveis. Dados de demonstração não entram nos relatórios de uma operação autenticada.

Receita bruta de pedidos pagos não representa lucro, saldo disponível nem receita líquida. Relatórios não somam BRL/EUR. Métricas sem fonte real são declaradas indisponíveis; mídia representa o intervalo sincronizado, não atribuição automática ao checkout.

## Dependências externas que não podem ser inventadas

Credenciais Meta/Shopify/Broski/Resend/Pushcut precisam pertencer ao titular e estar válidas. Uma VPS precisa estar acessível com agente autorizado e o domínio precisa ter DNS correto. O recebimento de e-mails de recuperação depende também de URLs permitidas e entrega configurada no Supabase. Cupons, cobrança recorrente e regras geográficas não são anunciados como prontos sem implementação completa.

Nenhuma migração deste pacote remove tabelas ou dados. Nenhum segredo é incluído neste documento ou em arquivos de ambiente. A preparação do banco usa exclusivamente `0007_funnel_storage.sql` e `0008_rate_limits.sql`, com RLS.

O build de produção de `dashboardatual` prepara essas tabelas automaticamente, com bloqueio transacional e verificação das quatro tabelas/RLS antes de finalizar. Desenvolvimento e preview não executam a preparação. A conexão é passada ao processo de migração somente por stdin, sem arquivos, argumentos ou logs privados. Uma falha interrompe o build; não promove uma preparação incompleta.

## Carregamento e segurança de execução

Editor, servidor e configurações não aguardam mais as consultas analíticas do dashboard inteiro. Os gráficos carregam apenas na área de dashboard, com feedback de carregamento; financeiro lê somente seu livro-caixa. Resolver uma associação existente é uma leitura, não uma gravação de perfil com lock a cada página.

O quadro do funil mostra um estado de carregamento explícito e enquadra os cards automaticamente na primeira abertura. Depois disso, preserva o zoom e a navegação do usuário. A versão publicada aparece no menu e no diagnóstico para distinguir a produção de uma cópia antiga.

O driver de produção é `pg`, sem pipelining ou prepared statements nomeados: evita consultas sobrepostas por conexão incompatíveis com o pooler transacional do Supabase. O pool tem até três conexões, espera de conexão limitada a 10 segundos e espera de consulta a 20 segundos. O build verifica oito consultas simultâneas e uma transação sem alterar dados. Os registros operacionais de analytics contêm apenas nome fixo da etapa, estado e duração, nunca SQL, parâmetros, credenciais ou dados pessoais.

Next.js e seu ESLint foram atualizados juntos para 16.3.8; o importador ZIP usa fflate 0.8.3. As verificações de segurança de dependências devem distinguir produção das ferramentas de desenvolvimento; não aplicar `audit fix --force`, que sugere regressão incompatível do Drizzle Kit.
