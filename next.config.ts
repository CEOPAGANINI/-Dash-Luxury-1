import type { NextConfig } from "next";

/* A versão publicada: os sete primeiros caracteres do commit que a Vercel
   construiu (VERCEL_GIT_COMMIT_SHA). Aparece no rodapé do menu da
   esquerda, para conferir que versão está no ar. */
const versao = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.COMMIT_SHA ??
  ""
).slice(0, 7);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERSAO: versao || "local" },
  /*
    Endereços antigos de áreas que foram renomeadas. Sem isto, quem tem a
    página salva nos favoritos — ou está com ela aberta quando um deploy
    entra — cai num 404 em vez de chegar na área certa.
  */
  async redirects() {
    return [
      {
        source: "/dashboard/aquisicao",
        destination: "/dashboard/trafego",
        permanent: true,
      },
      {
        source: "/dashboard/decisoes",
        destination: "/dashboard/notificacoes",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
