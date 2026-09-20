import type { Metadata } from "next";

import { company } from "@/lib/company";

export const metadata: Metadata = { title: "Política de Cookies" };

export default function CookiesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Política de Cookies</h1>
      <p className="text-sm text-zinc-500">
        Última atualização: {new Date().toLocaleDateString("pt-PT")}
      </p>

      <h2>O que são cookies</h2>
      <p>
        Cookies e tecnologias semelhantes são pequenos ficheiros guardados no
        seu dispositivo, usados para fazer a loja funcionar, medir a utilização
        e, quando autorizar, personalizar publicidade.
      </p>

      <h2>Categorias que utilizamos</h2>

      <h3>Essenciais (sempre ativos)</h3>
      <ul>
        <li>Manter o carrinho e o estado do checkout durante a compra.</li>
        <li>Guardar a sua escolha de consentimento de cookies.</li>
        <li>Segurança e prevenção de fraude.</li>
      </ul>
      <p className="text-sm text-zinc-600">
        Estes não podem ser desativados porque a loja não funciona sem eles.
      </p>

      <h3>Análise</h3>
      <ul>
        <li>
          Identificador anónimo de sessão, para contar visitantes e perceber que
          páginas são mais vistas. O endereço IP é mascarado.
        </li>
      </ul>

      <h3>Marketing</h3>
      <ul>
        <li>
          Píxeis de plataformas de publicidade (por exemplo Meta, Google ou
          TikTok), para medir resultados de campanhas e mostrar anúncios
          relevantes.
        </li>
      </ul>
      <p className="text-sm text-zinc-600">
        Só são carregados <strong>depois</strong> de aceitar. Se recusar, não
        são ativados.
      </p>

      <h2>Como alterar a sua escolha</h2>
      <p>
        Pode alterar a decisão a qualquer momento limpando os dados do site no
        seu navegador, o que fará reaparecer o aviso de cookies. Pode também
        bloquear cookies nas definições do navegador.
      </p>

      <h2>Contacto</h2>
      <p>
        Dúvidas sobre esta política:{" "}
        <a
          href={`mailto:${company.email}`}
          className="text-violet-600 underline"
        >
          {company.email}
        </a>
      </p>
    </>
  );
}
