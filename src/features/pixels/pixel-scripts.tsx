import Script from "next/script";

import { getActivePixelsForPublic } from "@/features/pixels/queries";
import type { PixelType } from "@/features/pixels/types";
import { ConsentGate } from "@/features/consent/consent-gate";

interface PixelScriptsProps {
  /** Evento de conteúdo disparado após o PageView */
  event?: "ViewContent" | "InitiateCheckout";
  content?: {
    id: string;
    name: string;
    valueCents: number;
    currency: string;
  };
}

/**
 * Injeta os pixels ativos nas páginas públicas.
 *
 * Regras:
 * - PageView dispara uma única vez por carregamento (o próprio snippet oficial).
 * - Purchase NUNCA é disparado aqui: só após confirmação de pagamento,
 *   pelo servidor (Conversions API), a partir do webhook do gateway.
 * - Tokens privados jamais chegam ao navegador (a consulta pública filtra).
 */
export async function PixelScripts({ event, content }: PixelScriptsProps) {
  const active = await getActivePixelsForPublic();
  if (active.length === 0) return null;

  const byType = (t: PixelType) => active.filter((p) => p.type === t);

  const metaPixels = byType("meta_pixel");
  const ga4 = byType("ga4");
  const gtm = byType("gtm");
  const googleAds = byType("google_ads");
  const tiktok = byType("tiktok_pixel");

  const value = content ? (content.valueCents / 100).toFixed(2) : undefined;

  return (
    <ConsentGate>
      {metaPixels.map((p) => (
        <Script
          key={`meta-${p.pixelId}`}
          id={`meta-pixel-${p.pixelId}`}
          strategy="afterInteractive"
        >
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${p.pixelId}');
fbq('track','PageView');
${
  event && content
    ? `fbq('track','${event}',{content_ids:['${content.id}'],content_name:${JSON.stringify(content.name)},content_type:'product',value:${value},currency:'${content.currency}'});`
    : ""
}`}
        </Script>
      ))}

      {gtm.map((p) => (
        <Script
          key={`gtm-${p.pixelId}`}
          id={`gtm-${p.pixelId}`}
          strategy="afterInteractive"
        >
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${p.pixelId}');`}
        </Script>
      ))}

      {[...ga4, ...googleAds].map((p) => (
        <Script
          key={`gtag-lib-${p.pixelId}`}
          src={`https://www.googletagmanager.com/gtag/js?id=${p.pixelId}`}
          strategy="afterInteractive"
        />
      ))}
      {[...ga4, ...googleAds].map((p) => (
        <Script
          key={`gtag-${p.pixelId}`}
          id={`gtag-${p.pixelId}`}
          strategy="afterInteractive"
        >
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${p.pixelId}');
${
  event && content
    ? `gtag('event','${event === "ViewContent" ? "view_item" : "begin_checkout"}',{currency:'${content.currency}',value:${value},items:[{item_id:'${content.id}',item_name:${JSON.stringify(content.name)}}]});`
    : ""
}`}
        </Script>
      ))}

      {tiktok.map((p) => (
        <Script
          key={`tt-${p.pixelId}`}
          id={`tiktok-${p.pixelId}`}
          strategy="afterInteractive"
        >
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};
ttq.load('${p.pixelId}');ttq.page();
}(window,document,'ttq');`}
        </Script>
      ))}
    </ConsentGate>
  );
}
