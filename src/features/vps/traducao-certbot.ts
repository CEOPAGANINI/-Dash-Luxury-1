/*
  O erro do HTTPS em português.

  O agente devolve o erro como "<código>: <mensagem>" (ex.:
  "certbot_falhou: <últimos 2000 caracteres da saída do certbot>"). A tela
  não mostra a saída crua do certbot quando dá para dizer o que fazer:
  DNS ainda propagando, porta 80 fechada no firewall do provedor, AAAA
  apontando para outro lugar, CAA restritivo e limite do Let's Encrypt.
  Nos outros casos, mostra a saída limpa.
*/

const IPV6_LITERAL = /\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}\b/i;

/** Tira caracteres de controle (menos a quebra de linha) e corta no fim. */
function limpar(texto: string, max = 600): string {
  const limpo = texto
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return limpo.length > max ? `…${limpo.slice(-max)}` : limpo;
}

export function traduzirErroCertbot(erro: string | null | undefined): string {
  const bruto = (erro ?? "").trim();
  if (!bruto) return "O HTTPS não foi emitido e o servidor não disse o motivo.";
  const [, codigo = "", resto = bruto] =
    /^([a-z_]{3,40}):\s*([\s\S]*)$/.exec(bruto) ?? [];

  if (codigo === "trava_local" || codigo === "somente_leitura")
    return "O dono travou este servidor na própria VPS (pausado ou somente leitura). Libere com sudo dash-agent liberar-escrita ou retomar.";
  if (codigo === "vhost_ausente")
    return 'O site ainda não está configurado no nginx deste servidor. Use "Reaplicar no servidor" e peça o HTTPS de novo.';
  if (codigo === "vhost_nao_responde")
    return 'O nginx desta VPS não respondeu pelo domínio na conferência local, antes do Let\'s Encrypt. Use "Reaplicar no servidor" e tente de novo.';

  if (
    /rateLimited|too many (?:failed authorizations|certificates|requests|new orders)|rate limit/i.test(
      resto,
    )
  )
    return "O Let's Encrypt limitou as tentativas deste domínio. Espere 1 hora antes de pedir o HTTPS de novo.";
  if (
    /\bCAA\b/.test(resto) &&
    /prevents? issuance|forbid|caa record/i.test(resto)
  )
    return "Um registro CAA do domínio não autoriza o Let's Encrypt. Apague o CAA ou inclua letsencrypt.org nele.";
  if (
    IPV6_LITERAL.test(resto) &&
    /timeout|invalid response|connection refused|connection reset/i.test(resto)
  )
    return "O domínio tem um registro AAAA (IPv6) que não chega a esta VPS, e o Let's Encrypt usa IPv6. Apague o AAAA e verifique o DNS de novo.";
  if (
    /NXDOMAIN|DNS problem|no valid (?:A|AAAA) records|SERVFAIL|looking up (?:A|AAAA)/i.test(
      resto,
    )
  )
    return "O DNS do domínio ainda não aponta para este servidor (ou ainda está propagando). Espere alguns minutos e verifique o DNS de novo.";
  if (
    /timeout during connect|likely firewall problem|connection refused|connection reset/i.test(
      resto,
    )
  )
    return "O Let's Encrypt não conseguiu chegar à porta 80 deste servidor. Libere as portas 80 e 443 no firewall do provedor da VPS.";
  if (/invalid response from|unauthorized|404/i.test(resto))
    return "O Let's Encrypt chegou a outro servidor ou não achou o arquivo de validação. Confira se o DNS aponta só para esta VPS (Cloudflare: deixe a nuvem cinza).";

  return `O HTTPS falhou: ${limpar(resto)}`;
}
