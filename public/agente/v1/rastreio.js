/*
 * Rastreio do Servidor do Funil (v1). Vai nas páginas que moram na VPS:
 *   <script src="https://APP/agente/v1/rastreio.js" data-produto="SLUG_DO_PRODUTO" defer></script>
 *
 * Manda page_view ao carregar, heartbeat a cada 30 s com a aba visível e click_buy em links para
 * /checkout, direto do navegador para https://APP/api/public/track (CORS liberado só para os
 * domínios com DNS conferido). Por ser o navegador quem fala com o app, IP e país são os reais.
 * O id anônimo fica no localStorage do domínio da VPS (infinity:aid, a mesma chave do app): a mesma
 * pessoa conta como dois visitantes se passar pelos dois domínios. Nunca quebra a página.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- ES5 de propósito: `catch {}` sem variável é ES2019 */
(function () {
  "use strict";
  if (window.__dashRastreio) return;
  window.__dashRastreio = true;

  var script =
    document.currentScript ||
    document.querySelector('script[src*="/agente/v1/rastreio.js"]');
  if (!script) return;
  var origem;
  try {
    origem = new URL(script.src, location.href).origin;
  } catch (e) {
    return;
  }
  var produto = (script.getAttribute("data-produto") || "").slice(0, 128);
  var CHAVE = "infinity:aid";
  var UTM = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "src",
    "sck",
    "fbclid",
    "gclid",
    "ttclid",
  ];

  function idAleatorio() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map
      .call(b, function (x) {
        return (x + 256).toString(16).slice(1);
      })
      .join("");
    return (
      h.slice(0, 8) +
      "-" +
      h.slice(8, 12) +
      "-" +
      h.slice(12, 16) +
      "-" +
      h.slice(16, 20) +
      "-" +
      h.slice(20)
    );
  }

  function idAnonimo() {
    try {
      var id = localStorage.getItem(CHAVE);
      if (!id) {
        id = idAleatorio();
        localStorage.setItem(CHAVE, id);
      }
      return id;
    } catch (e) {
      return "anon";
    }
  }

  function utm() {
    var saida = {};
    try {
      var p = new URLSearchParams(location.search);
      for (var i = 0; i < UTM.length; i++) {
        var v = p.get(UTM[i]);
        if (v) saida[UTM[i]] = v.slice(0, 200);
      }
    } catch (e) {
      /* ignora */
    }
    return saida;
  }

  function enviar(evento) {
    try {
      var corpo = {
        anonymousId: idAnonimo(),
        event: evento,
        page: location.pathname,
        referrer: document.referrer || undefined,
        utm: utm(),
        productSlug: produto || undefined,
      };
      fetch(origem + "/api/public/track", {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).catch(function () {});
    } catch (e) {
      /* rastreamento nunca quebra a página */
    }
  }

  function ehCheckout(link) {
    try {
      var u = new URL(link.href, location.href);
      return (
        u.origin === location.origin &&
        (u.pathname === "/checkout" || u.pathname.indexOf("/checkout/") === 0)
      );
    } catch (e) {
      return false;
    }
  }

  enviar("page_view");
  setInterval(function () {
    if (document.visibilityState === "visible") enviar("heartbeat");
  }, 30000);
  document.addEventListener(
    "click",
    function (ev) {
      var alvo = ev.target;
      var link = alvo && alvo.closest ? alvo.closest("a[href]") : null;
      if (link && ehCheckout(link)) enviar("click_buy");
    },
    true,
  );
})();
