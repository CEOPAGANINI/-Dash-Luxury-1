import type { Metadata } from "next";

import { company, companyIdentification } from "@/lib/company";

export const metadata: Metadata = { title: "Termos e Condições" };

export default function TermosPage() {
  const identification = companyIdentification();

  return (
    <>
      <h1 className="text-2xl font-bold">Termos e Condições</h1>
      <p className="text-sm text-zinc-500">
        Última atualização: {new Date().toLocaleDateString("pt-PT")}
      </p>

      <h2>1. Identificação do vendedor</h2>
      <p>
        {identification ||
          "[Preencher: denominação social, NIF, morada e localidade da empresa]"}
      </p>
      <p>
        Contacto de apoio ao cliente:{" "}
        <a
          href={`mailto:${company.email}`}
          className="text-violet-600 underline"
        >
          {company.email}
        </a>
        {company.phone ? ` · ${company.phone}` : ""}
      </p>

      <h2>2. Objeto</h2>
      <p>
        Estes termos regulam a venda de produtos através desta loja online a
        consumidores. Ao concluir uma encomenda, o cliente declara ter lido e
        aceite estas condições.
      </p>

      <h2>3. Encomendas e preços</h2>
      <ul>
        <li>Os preços apresentados incluem IVA à taxa legal em vigor.</li>
        <li>
          Os custos de envio, quando aplicáveis, são apresentados antes da
          conclusão da encomenda.
        </li>
        <li>
          A encomenda só se considera aceite após confirmação do pagamento.
        </li>
        <li>
          Reservamo-nos o direito de cancelar encomendas em caso de erro
          manifesto de preço ou indisponibilidade do produto, devolvendo
          integralmente qualquer valor já pago.
        </li>
      </ul>

      <h2>4. Pagamento</h2>
      <p>
        Os pagamentos são processados por MB WAY e Multibanco através de um
        prestador de serviços de pagamento licenciado na União Europeia. Não
        recolhemos nem armazenamos dados completos de cartão.
      </p>

      <h2>5. Entrega</h2>
      <p>
        As entregas são efetuadas em Portugal continental. Os prazos indicados
        são estimativas em dias úteis, contados a partir da confirmação do
        pagamento. Consulte a página de Envios e Entregas para mais detalhes.
      </p>

      <h2>6. Direito de livre resolução</h2>
      <p>
        Nos termos do Decreto-Lei n.º 24/2014, o consumidor dispõe de 14 dias
        para resolver o contrato sem necessidade de indicar qualquer motivo,
        contados da data de receção do produto. Consulte a página de Trocas e
        Devoluções para saber como exercer este direito.
      </p>

      <h2>7. Garantia</h2>
      <p>
        Os produtos beneficiam da garantia legal de conformidade prevista no
        Decreto-Lei n.º 84/2021, aplicável aos bens vendidos a consumidores.
      </p>

      <h2>8. Resolução de litígios</h2>
      <p>
        Em caso de litígio, o consumidor pode recorrer a uma entidade de
        Resolução Alternativa de Litígios. Pode ainda utilizar o Livro de
        Reclamações eletrónico em{" "}
        <a
          href="https://www.livroreclamacoes.pt/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-600 underline"
        >
          livroreclamacoes.pt
        </a>
        .
      </p>

      <h2>9. Lei aplicável</h2>
      <p>
        Estes termos regem-se pela lei portuguesa. Para a resolução de quaisquer
        litígios é competente o foro da comarca da sede do vendedor, sem
        prejuízo dos direitos do consumidor.
      </p>
    </>
  );
}
