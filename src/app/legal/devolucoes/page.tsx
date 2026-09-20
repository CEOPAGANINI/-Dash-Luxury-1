import type { Metadata } from "next";

import { company } from "@/lib/company";

export const metadata: Metadata = { title: "Trocas e Devoluções" };

export default function DevolucoesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Trocas e Devoluções</h1>

      <h2>Direito de livre resolução (14 dias)</h2>
      <p>
        Nos termos do Decreto-Lei n.º 24/2014, tem 14 dias a contar da receção
        do produto para desistir da compra, sem necessidade de justificação.
      </p>

      <h2>Como devolver</h2>
      <ul>
        <li>
          Envie um e-mail para{" "}
          <a
            href={`mailto:${company.email}`}
            className="text-violet-600 underline"
          >
            {company.email}
          </a>{" "}
          indicando a referência da encomenda.
        </li>
        <li>Receberá as instruções e a morada de devolução.</li>
        <li>
          O produto deve seguir completo, com todos os acessórios e, sempre que
          possível, na embalagem original.
        </li>
      </ul>

      <h2>Reembolso</h2>
      <p>
        Após a receção e verificação do produto, o reembolso é processado pelo
        mesmo meio de pagamento utilizado na compra, no prazo máximo de 14 dias.
      </p>

      <h2>Produto com defeito</h2>
      <p>
        Se o produto apresentar defeito, a garantia legal de conformidade
        (Decreto-Lei n.º 84/2021) aplica-se e os custos de devolução são
        suportados por nós. Contacte-nos com fotografias do problema.
      </p>
    </>
  );
}
