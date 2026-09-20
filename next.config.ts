import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
