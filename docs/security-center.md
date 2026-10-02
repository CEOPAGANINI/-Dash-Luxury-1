# Central de segurança e privacidade

A página `/configuracoes/seguranca` reúne verificações atuais e o registro das configurações aplicadas em 2 de outubro de 2026. O indicador verde significa que o controle descrito foi confirmado no escopo indicado pelo cartão. Ele não promete anonimato ou ausência de vulnerabilidades.

## Acesso

O serviço e `GET /api/painel/seguranca` exigem uma sessão real e a política existente `principalOperator`: usuário confirmado incluído em `DASHBOARD_DONOS`, com fallback para `VPS_DONOS` quando a primeira variável está ausente. Ser proprietário de um workspace não libera esta central, pois os metadados abrangem todo o projeto. O handler retorna 401 para sessões ausentes ou demo e 403 para usuários fora da lista. O proxy de autenticação existente pode redirecionar visitantes anônimos para `/login` antes da execução do handler; o cliente trata respostas de login sem JSON como perda de acesso. Falhas ao verificar a sessão recebem 503 genérico. Nenhuma consulta de metadados ocorre antes desta autorização.

Não configure chaves administrativas ou tokens de GitHub/Vercel em variáveis `NEXT_PUBLIC_*`. A central reutiliza a conexão de banco existente no servidor. Não acrescenta tokens externos, tabelas, migrações ou permissões.

## Verificações ao vivo

- Autenticação: a sessão real do operador, a configuração Supabase e o comportamento de `allowLocalDemo` em produção são verificados na execução atual. Não é um teste de todas as rotas da aplicação.
- Tracking: uma URL sintética verifica os sanitizadores reais de página, referência e atribuição desta versão. Dados históricos, outros rastreadores e todas as chamadas externas não são auditados.
- Banco: somente contagens agregadas de catálogos PostgreSQL e metadados de `storage.buckets`, em uma transação `READ ONLY`, `REPEATABLE READ`, com `statement_timeout` local de cinco segundos. A conexão tem os limites existentes de dez segundos para conectar e vinte para consultas. Nenhuma linha de clientes, arquivo ou regra de funil é lida.
- RLS: todas as tabelas regulares/particionadas do schema `public` devem ter RLS, e deve existir ao menos uma tabela. Roles `anon`/`authenticated` não podem ter `SUPERUSER`, `BYPASSRLS` ou herdar a propriedade de uma tabela sem `FORCE ROW LEVEL SECURITY`. O conteúdo das políticas, views e demais schemas não é avaliado neste controle.
- Permissões administrativas: `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` efetivos em tabelas, incluindo herança de roles e `PUBLIC`. `REFERENCES` em colunas também é verificado. São contagens de privilégios efetivos, não a contagem histórica de GRANTs revogados.
- Novas tabelas: ACLs padrão globais e do schema `public` de todos os criadores registrados, para os oito privilégios de tabela concedidos a `PUBLIC` ou às roles da API por herança. Isto verifica os padrões configurados; não impede um `GRANT` explícito posterior ou uma role da API de criar seus próprios objetos caso obtenha essa permissão. Os padrões de funções e sequências têm escopo próprio e permanecem fora deste controle.
- Storage: `dash`, `product-files`, `attachments` e `avatars` privados; `product-images` público por escolha; nenhum outro bucket público. Políticas de Storage, URLs assinadas e conteúdo dos arquivos não são avaliados.
- Funções: contagem de funções `SECURITY DEFINER` em `public` executáveis pelas roles da API ou por `PUBLIC`. O corpo das funções e schemas internos não são avaliados.
- Cabeçalhos: o navegador avalia a resposta realmente recebida da API para `private`/`no-store`, robots, `DENY`/`frame-ancestors 'none'`, `no-referrer` e ausência de `X-Powered-By`. Antes da primeira resposta, estes cartões ficam desconhecidos. Nenhum cabeçalho privado é exibido integralmente.

A ausência de conexão, metadados incompletos, roles ausentes, versão PostgreSQL anterior à 17 ou falha na consulta gera estado desconhecido, nunca verde. Mudanças incompatíveis produzem aviso. Uma verificação ao vivo perde validade após dois minutos sem atualização; o cliente deve usar `expireLiveChecks`/`isLiveCheckFresh` para retirar o verde. As datas usam ISO UTC e são apresentadas no fuso `America/Sao_Paulo`; a data civil da auditoria permanece explícita.

## Evidência de auditoria e pendências

As configurações de contas GitHub/Vercel são evidência de auditoria com data explícita, não consultas contínuas a estes provedores. O registro não detecta automaticamente mudanças nessas contas sem uma integração administrativa adicional. Pendências como 2FA, domínio, Cloudflare e hospedagem externa não podem ser mostradas como ativas.

O painel se atualiza enquanto a página está aberta. Não cria um serviço de monitoramento permanente ou notificações fora do dashboard. DNS, certificados públicos, provedores de hospedagem e destinos de redirecionamento podem permanecer observáveis.

## Verificação

Os testes de `security-center-*` cobrem autorização do operador, erros sem dados privados, conexão ausente, resultados incompletos, cabeçalhos reais, expiração e consultas contra um PostgreSQL isolado com herança de roles, grants em colunas, ACLs padrão globais, Storage público e funções privilegiadas. O fixture local usa PostgreSQL 18; o projeto auditado usa PostgreSQL 17.6. A consulta não faz alterações no banco de produção.

Referências: [proteção da API Supabase](https://supabase.com/docs/guides/api/securing-your-api), [funções de privilégios PostgreSQL 17](https://www.postgresql.org/docs/17/functions-info.html), [ACLs padrão](https://www.postgresql.org/docs/17/catalog-pg-default-acl.html), [RLS e propriedade](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
