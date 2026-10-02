# Administração privada — primeira etapa

Sem configuração de autenticação, produção e previews publicados não recebem uma sessão demo. O proxy responde 503 em áreas privadas e getSession retorna null. A demonstração permanece disponível apenas fora de produção e fora da Vercel.

Respostas privadas e de autenticação usam no-store, noindex e no-referrer e bloqueiam enquadramento. Outras diretivas CSP são preservadas. A configuração remove X-Powered-By, mantém source maps públicos desativados e define nosniff. Extensões de imagem em rotas dinâmicas não dispensam autenticação; assets conhecidos continuam públicos.

O rastreamento remove parâmetros, fragmentos e credenciais de URLs de página; o referrer guarda somente a origem. A atribuição mantém as dez chaves existentes. A sanitização ocorre no navegador, no endpoint e antes da gravação. Dados históricos não são apagados por esta alteração.

Esses controles não ocultam DNS, certificados, IPs públicos de uma CDN ou registros históricos. Antes de publicação, confirme Supabase configurado e teste login e renovação de sessão. As rotas públicas de loja, checkout, webhooks e agente permanecem no fluxo existente; webhooks e agente continuam dependendo das próprias verificações de assinatura.

Controles de plataforma confirmados em 02/10/2026: GitHub privado; grafo de dependências, alertas de vulnerabilidades e pacotes maliciosos e correções automáticas ativados. Vercel com proteção padrão de previews e source maps protegidos; uso de código/conversas deste projeto para treinamento desativado.

Pendências: política de cadastro e MFA; auditoria real de RLS/views/funções/buckets do projeto Supabase de produção; separação do funil público do editor e implantação do motor PHP. O conector inicialmente não tinha acesso ao banco correto. Não foi feita alteração no banco ou no DNS. Compra de domínio ou VPS não é requisito para essas proteções do dashboard, mas o endereço vercel.app e a hospedagem Vercel seguem identificáveis.
