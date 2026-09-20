import type { Metadata } from "next";

import { company, companyIdentification } from "@/lib/company";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  const identification = companyIdentification();

  return (
    <>
      <h1 className="text-2xl font-bold">Política de Privacidade</h1>
      <p className="text-sm text-zinc-500">
        Última atualização: {new Date().toLocaleDateString("pt-PT")}
      </p>

      <h2>1. Responsável pelo tratamento</h2>
      <p>
        {identification ||
          "[Preencher: denominação social, NIF, morada e localidade da empresa]"}
      </p>
      <p>
        Para exercer os seus direitos, contacte:{" "}
        <a
          href={`mailto:${company.email}`}
          className="text-violet-600 underline"
        >
          {company.email}
        </a>
      </p>

      <h2>2. Dados que recolhemos</h2>
      <ul>
        <li>
          <strong>Dados de encomenda:</strong> nome, apelido, e-mail, telefone,
          morada de entrega e código postal.
        </li>
        <li>
          <strong>Dados de pagamento:</strong> processados diretamente pelo
          prestador de pagamentos. Não recebemos nem guardamos números completos
          de cartão.
        </li>
        <li>
          <strong>Dados de navegação:</strong> identificador anónimo de sessão,
          páginas visitadas, tipo de dispositivo, navegador, país aproximado e
          origem da visita. O endereço IP é <strong>mascarado</strong> antes de
          ser guardado.
        </li>
      </ul>

      <h2>3. Finalidades e fundamentos legais</h2>
      <ul>
        <li>
          <strong>Processar a sua encomenda</strong> — execução do contrato.
        </li>
        <li>
          <strong>Cumprir obrigações fiscais e contabilísticas</strong> —
          obrigação legal.
        </li>
        <li>
          <strong>Medir e melhorar a loja</strong> — interesse legítimo, com
          dados agregados e IP mascarado.
        </li>
        <li>
          <strong>Marketing e publicidade personalizada</strong> —{" "}
          <strong>apenas com o seu consentimento</strong>, que pode retirar a
          qualquer momento.
        </li>
      </ul>

      <h2>4. Partilha com terceiros</h2>
      <p>
        Partilhamos apenas o estritamente necessário com: o prestador de
        pagamentos (para processar a transação), a transportadora (para
        entregar), o alojamento e base de dados (para operar a loja) e, quando
        tiver consentido, plataformas de publicidade.
      </p>

      <h2>5. Conservação</h2>
      <p>
        Os dados de faturação são conservados pelo prazo legal aplicável. Os
        dados de navegação são conservados por períodos curtos e em forma
        agregada.
      </p>

      <h2>6. Os seus direitos</h2>
      <p>
        Tem direito a aceder, retificar, apagar, limitar ou opor-se ao
        tratamento dos seus dados, bem como à portabilidade. Pode ainda
        apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD).
      </p>

      <h2>7. Segurança</h2>
      <p>
        Utilizamos ligação encriptada (HTTPS), controlo de acesso à base de
        dados e cifragem das credenciais de integrações. O acesso aos dados de
        clientes está restrito ao pessoal autorizado.
      </p>
    </>
  );
}
