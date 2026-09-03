# Infinity — Painel

Painel de operação e empresa: financeiro (entradas e saídas), campanhas
(ROAS / ROI / CPA) e banco de leads por nicho. Next.js 15 + Supabase.

## Como publicar na Vercel

1. Acesse `vercel.com` → **Add New** → **Project**.
2. Importe o repositório `CEOPAGANINI/-Dash-Luxury-1` e escolha a branch
   `claude/vercel-supabase-dashboard-zca00s`.
3. Em **Environment Variables**, cole as duas variáveis abaixo.
4. Clique em **Deploy**.

```
NEXT_PUBLIC_SUPABASE_URL=https://dzjvmbfgytbhhpkcaxei.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_-TfV2MNdiW99eLkl-U646Q_wwGM9oLP
```

São só essas duas — as duas são públicas de propósito: elas já viajam no
código que roda no navegador de qualquer visitante. Nenhuma chave secreta
(`sb_secret_...`) e nenhuma senha de banco são necessárias, porque o acesso
aos dados é feito pelo próprio usuário logado, com as travas de segurança
ativas no banco.

Depois do deploy, no painel do Supabase em **Authentication → URL
Configuration**, coloque o endereço do site em **Site URL** para os e-mails de
confirmação apontarem para o lugar certo.

## Rodar na sua máquina

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Banco de dados

As tabelas já estão criadas no projeto Supabase `dzjvmbfgytbhhpkcaxei`:

| Tabela | Para que serve |
| --- | --- |
| `perfis` | Nome e empresa de cada usuário. Criado sozinho no cadastro. |
| `movimentos` | Cada entrada e saída de dinheiro. Base do lucro e dos gráficos. |
| `campanhas` | Investimento, receita, leads e vendas por campanha. Base do ROAS/ROI/CPA. |
| `leads` | Contatos separados por nicho, com status e valor estimado. |

Todas com **RLS ligado**: cada usuário só enxerga e só altera as próprias
linhas. Ninguém vê os dados de outra conta, nem por acidente nem de propósito.

## Como as contas são feitas

- **Lucro** = entradas − saídas, no período.
- **Seta de variação** compara o período com o período anterior de mesmo
  tamanho. Quando o período anterior foi zero, aparece "sem base" em vez de
  uma porcentagem inventada.
- **ROAS** = receita ÷ investimento.
- **ROI** = (receita − investimento) ÷ investimento, em %.
- **CPA** = investimento ÷ número de vendas.
- **Lucro por venda** = (receita − investimento) ÷ número de vendas.

Somas de campanha na visão geral consideram apenas campanhas com status
`ativa`; a página de Campanhas soma todas.

## O que ainda não existe

Integração automática com Facebook Ads / Google Ads, envio de SMS, WhatsApp e
e-mail. Enquanto isso, o investimento em anúncios é digitado na tela de
Campanhas — as contas derivadas saem sozinhas.
