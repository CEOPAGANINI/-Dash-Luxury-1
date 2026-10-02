# Redirecionador dentro do funil

O bloco Redirecionador possui uma aba Painel completo com o administrador YellowTDS em um iframe. Cada bloco pode guardar `redir.campanhaId`, que abre a campanha correspondente. Sem vínculo, o administrador abre a lista de campanhas. O vínculo é salvo junto com o funil, usando o armazenamento e a sincronização existentes.

A página `/filtro-de-acesso` redireciona para `/roteador-de-ofertas` e deixa de aparecer no menu. Os modelos de países, aparelhos e regras permanecem disponíveis ao roteador.

## Hospedagem necessária

O PHP/SQLite precisa de uma hospedagem própria; este commit não hospeda nem converte o motor PHP em funções Next.js. Configure `NEXT_PUBLIC_REDIRECTOR_ADMIN_URL` na Vercel com o endereço HTTPS público do administrador, terminando em `/admin/index.php`, e publique novamente. Esse endereço é público e não deve conter senhas, tokens ou parâmetros. Endereços locais são recusados para evitar uma integração que só funcionaria na máquina do desenvolvedor.

O servidor do YellowTDS deve permitir enquadramento apenas pela origem `https://dashboardatual.vercel.app` via CSP `frame-ancestors`. Cabeçalhos `X-Frame-Options: DENY/SAMEORIGIN` bloqueiam o iframe entre origens. Use autenticação própria; o dashboard não transmite senhas. Cookies de sessão em origens diferentes precisam de HTTPS e atributos compatíveis com iframe (`SameSite=None; Secure`). Navegadores que bloqueiam cookies de terceiros podem exigir o botão Abrir em nova aba.

As regras do editor de exportação do funil e as campanhas no motor YellowTDS são configurações distintas: o vínculo abre a campanha, mas não copia automaticamente regras entre os dois sistemas. O painel completo opera sobre os dados reais da hospedagem YellowTDS. As abas de demonstração do editor original permanecem identificadas como demonstração.

Sem hospedagem configurada, a aba mostra Aguardando a conexão com a hospedagem e mantém o editor existente disponível. Não há dados de produção fictícios nem redirecionamento para localhost.

