# Agente IA no dashboard atual

A área `/agente-ia` usa o mesmo projeto, autenticação e operação do dashboard. Não precisa de outro repositório nem de outro projeto Vercel. O layout do painel e as versões Next.js/React existentes são preservados.

## Explorar a demonstração

Abra **Agente IA → Assistente**. Demonstração é o modo inicial e funciona sem chave: respostas locais por tarefa, duas lojas fictícias e as métricas do simulador Facebook Ads. Não é uma conversa livre com um modelo. Análise de tráfego, plano de campanha, roteiros de criativos e checklist de infraestrutura podem ser gerados e exportados em Markdown. Histórico, loja selecionada e preferências persistem durante a navegação interna da área do agente; recarregar ou sair da área reinicia a demonstração. As preferências do simulador são ilustrativas.

## Conectar IA

1. Entre com uma conta proprietária ou administradora da operação.
2. Em **Configurações**, selecione **IA conectada**.
3. Escolha Groq, OpenAI ou Claude/Anthropic. Informe o ID exato de um modelo disponível na sua conta e uma chave de API do mesmo provedor.
4. Defina o máximo de tokens por resposta (256–4.000), consultas por dia da operação (1–200) e o contexto permitido: campanhas e/ou cadastro de domínios.
5. Salve. A configuração é guardada; a primeira consulta real confirma a validade da chave/modelo no provedor. Custos e limites adicionais dependem do plano desse provedor.
6. Volte ao assistente, mantenha **IA conectada** e envie a tarefa. A solicitação e o contexto habilitado serão enviados ao provedor escolhido. Não cole senhas ou dados pessoais.

Proprietários, administradores, marketing e analistas podem consultar. Viewer, suporte e financeiro não têm acesso à API do agente. Histórico real é do usuário autenticado dentro de sua operação, limitado às últimas 20 consultas concluídas na interface.

## Servidor, dados e segurança

- Reutiliza `integrations` e `integration_logs`, sem tabelas paralelas ou substituição de migrações. Credencial e conteúdo de consulta/resposta são criptografados com o helper AES-256-GCM já existente. Logs genéricos mostram metadados; não o conteúdo descriptografado.
- Precisa das conexões Supabase/Postgres existentes e da configuração de criptografia (`ENCRYPTION_KEY`, preferida pelo helper existente). Nunca definir segredos como `NEXT_PUBLIC_*`.
- Endpoints `/api/ia-agent` (GET histórico, POST consulta) e `/api/ia-agent/settings` (GET configuração pública, PUT salvar, DELETE remover chave) executam em Node.js. O banco e o helper `node:crypto` exigem esse runtime; não se usa a configuração Edge do script antigo.
- Toda consulta real exige sessão e papel autorizado no servidor. Operação/usuário vêm da sessão, nunca do JSON do cliente. Configuração pública não devolve chave, máscara ou payload criptografado.
- Limite diário é reservado antes da chamada sob lock transacional Postgres, compartilhado entre instâncias da Vercel. Tentativas com falha contam. Reinicia à meia-noite UTC. Falha no banco bloqueia a chamada paga.
- Provedores usam URLs fixas, sem endpoint customizável ou redirects; timeout de 40 segundos, orçamento de saída em tokens, corpo da solicitação limitado a 64 KB e histórico de até 8 mensagens.
- Contexto real é snapshot do banco, até 20 campanhas e 20 domínios da operação. Datas de sincronização e limitações acompanham o contexto. Campanhas ainda não são atribuídas a uma loja; não misturar esse snapshot com as BMs/lojas fictícias da demonstração.
- Respostas são texto, sem executar HTML, código, ferramentas ou ações. Redação automática remove padrões comuns de chaves; não substitui o cuidado de não inserir segredos.

## Limites funcionais

O agente analisa e prepara rascunhos. Não publica anúncios, não muda verbas, não altera DNS, servidor ou banco, não instala proteção e não oferece garantia de lucro ou segurança. Conexões Meta/Google, domínios e diagnóstico continuam nos módulos existentes. Sem dados reais, a IA recebe contexto vazio e deve informar essa limitação.

Cloudflare exige domínio, conta e configuração real de DNS/SSL apropriada à hospedagem. Nenhuma zona, proxy ou garantia de ocultação de IP é criada pelo chat. Realtime de conversas e execução automática de campanhas não estão implementados nesta versão.

## Documentação dos protocolos

- [Groq: compatibilidade OpenAI](https://console.groq.com/docs/openai)
- [OpenAI: Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Anthropic: Messages](https://platform.claude.com/docs/en/api/messages/create)
- [Supabase: cliente SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)

As APIs de provedores são testadas com respostas simuladas; sem uma chave real não é possível validar saldo, modelo disponível nem inferência ao vivo. Vercel e a interface são verificadas separadamente.
