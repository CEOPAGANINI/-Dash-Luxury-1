"use client";

import * as React from "react";

/** Um ponto vivo no globo: uma cidade/região com visitantes online. */
export interface LiveGlobePoint {
  id: string;
  lat: number;
  lon: number;
  /** Nome do país já traduzido para exibição. */
  country: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  city: string | null;
  /** Intensidade: quantidade de utilizadores online neste ponto. */
  users: number;
}

/* -------------------------------------------------------------------------- */
/* Catálogo geográfico                                                        */
/* -------------------------------------------------------------------------- */

interface CityRef {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  /** Peso relativo na simulação — mercados maiores aparecem mais. */
  weight: number;
}

/**
 * Cidades usadas pelo feed simulado. Peso enviesado para Brasil e Portugal,
 * que é onde a Infinity concentra o tráfego real.
 */
const CITIES: CityRef[] = [
  {
    city: "São Paulo",
    country: "Brasil",
    countryCode: "BR",
    lat: -23.55,
    lon: -46.63,
    weight: 14,
  },
  {
    city: "Rio de Janeiro",
    country: "Brasil",
    countryCode: "BR",
    lat: -22.91,
    lon: -43.17,
    weight: 9,
  },
  {
    city: "Belo Horizonte",
    country: "Brasil",
    countryCode: "BR",
    lat: -19.92,
    lon: -43.94,
    weight: 6,
  },
  {
    city: "Curitiba",
    country: "Brasil",
    countryCode: "BR",
    lat: -25.43,
    lon: -49.27,
    weight: 5,
  },
  {
    city: "Porto Alegre",
    country: "Brasil",
    countryCode: "BR",
    lat: -30.03,
    lon: -51.23,
    weight: 5,
  },
  {
    city: "Salvador",
    country: "Brasil",
    countryCode: "BR",
    lat: -12.97,
    lon: -38.5,
    weight: 5,
  },
  {
    city: "Recife",
    country: "Brasil",
    countryCode: "BR",
    lat: -8.05,
    lon: -34.9,
    weight: 4,
  },
  {
    city: "Fortaleza",
    country: "Brasil",
    countryCode: "BR",
    lat: -3.73,
    lon: -38.53,
    weight: 4,
  },
  {
    city: "Brasília",
    country: "Brasil",
    countryCode: "BR",
    lat: -15.79,
    lon: -47.88,
    weight: 4,
  },
  {
    city: "Manaus",
    country: "Brasil",
    countryCode: "BR",
    lat: -3.12,
    lon: -60.02,
    weight: 3,
  },
  {
    city: "Lisboa",
    country: "Portugal",
    countryCode: "PT",
    lat: 38.72,
    lon: -9.14,
    weight: 7,
  },
  {
    city: "Porto",
    country: "Portugal",
    countryCode: "PT",
    lat: 41.15,
    lon: -8.61,
    weight: 5,
  },
  {
    city: "Madrid",
    country: "Espanha",
    countryCode: "ES",
    lat: 40.42,
    lon: -3.7,
    weight: 4,
  },
  {
    city: "Barcelona",
    country: "Espanha",
    countryCode: "ES",
    lat: 41.39,
    lon: 2.17,
    weight: 3,
  },
  {
    city: "Buenos Aires",
    country: "Argentina",
    countryCode: "AR",
    lat: -34.6,
    lon: -58.38,
    weight: 4,
  },
  {
    city: "Santiago",
    country: "Chile",
    countryCode: "CL",
    lat: -33.45,
    lon: -70.67,
    weight: 3,
  },
  {
    city: "Bogotá",
    country: "Colômbia",
    countryCode: "CO",
    lat: 4.71,
    lon: -74.07,
    weight: 3,
  },
  {
    city: "Cidade do México",
    country: "México",
    countryCode: "MX",
    lat: 19.43,
    lon: -99.13,
    weight: 4,
  },
  {
    city: "Miami",
    country: "Estados Unidos",
    countryCode: "US",
    lat: 25.76,
    lon: -80.19,
    weight: 4,
  },
  {
    city: "Nova Iorque",
    country: "Estados Unidos",
    countryCode: "US",
    lat: 40.71,
    lon: -74.01,
    weight: 4,
  },
  {
    city: "Los Angeles",
    country: "Estados Unidos",
    countryCode: "US",
    lat: 34.05,
    lon: -118.24,
    weight: 3,
  },
  {
    city: "Toronto",
    country: "Canadá",
    countryCode: "CA",
    lat: 43.65,
    lon: -79.38,
    weight: 2,
  },
  {
    city: "Londres",
    country: "Reino Unido",
    countryCode: "GB",
    lat: 51.51,
    lon: -0.13,
    weight: 3,
  },
  {
    city: "Paris",
    country: "França",
    countryCode: "FR",
    lat: 48.86,
    lon: 2.35,
    weight: 3,
  },
  {
    city: "Berlim",
    country: "Alemanha",
    countryCode: "DE",
    lat: 52.52,
    lon: 13.4,
    weight: 3,
  },
  {
    city: "Milão",
    country: "Itália",
    countryCode: "IT",
    lat: 45.46,
    lon: 9.19,
    weight: 2,
  },
  {
    city: "Amesterdão",
    country: "Países Baixos",
    countryCode: "NL",
    lat: 52.37,
    lon: 4.9,
    weight: 2,
  },
  {
    city: "Dublin",
    country: "Irlanda",
    countryCode: "IE",
    lat: 53.35,
    lon: -6.26,
    weight: 2,
  },
  {
    city: "Luanda",
    country: "Angola",
    countryCode: "AO",
    lat: -8.84,
    lon: 13.23,
    weight: 2,
  },
  {
    city: "Maputo",
    country: "Moçambique",
    countryCode: "MZ",
    lat: -25.97,
    lon: 32.57,
    weight: 2,
  },
  {
    city: "Joanesburgo",
    country: "África do Sul",
    countryCode: "ZA",
    lat: -26.2,
    lon: 28.05,
    weight: 2,
  },
  {
    city: "Dubai",
    country: "Emirados Árabes",
    countryCode: "AE",
    lat: 25.2,
    lon: 55.27,
    weight: 2,
  },
  {
    city: "Bombaim",
    country: "Índia",
    countryCode: "IN",
    lat: 19.08,
    lon: 72.88,
    weight: 3,
  },
  {
    city: "Singapura",
    country: "Singapura",
    countryCode: "SG",
    lat: 1.35,
    lon: 103.82,
    weight: 2,
  },
  {
    city: "Tóquio",
    country: "Japão",
    countryCode: "JP",
    lat: 35.68,
    lon: 139.69,
    weight: 2,
  },
  {
    city: "Seul",
    country: "Coreia do Sul",
    countryCode: "KR",
    lat: 37.57,
    lon: 126.98,
    weight: 2,
  },
  {
    city: "Sydney",
    country: "Austrália",
    countryCode: "AU",
    lat: -33.87,
    lon: 151.21,
    weight: 2,
  },
];

/** Centroides por país, para posicionar sessões reais que só têm country code. */
const COUNTRY_CENTROIDS: Record<
  string,
  { name: string; lat: number; lon: number }
> = {
  BR: { name: "Brasil", lat: -14.24, lon: -51.93 },
  PT: { name: "Portugal", lat: 39.4, lon: -8.22 },
  ES: { name: "Espanha", lat: 40.46, lon: -3.75 },
  US: { name: "Estados Unidos", lat: 37.09, lon: -95.71 },
  CA: { name: "Canadá", lat: 56.13, lon: -106.35 },
  MX: { name: "México", lat: 23.63, lon: -102.55 },
  AR: { name: "Argentina", lat: -38.42, lon: -63.62 },
  CL: { name: "Chile", lat: -35.68, lon: -71.54 },
  CO: { name: "Colômbia", lat: 4.57, lon: -74.3 },
  PE: { name: "Peru", lat: -9.19, lon: -75.02 },
  UY: { name: "Uruguai", lat: -32.52, lon: -55.77 },
  PY: { name: "Paraguai", lat: -23.44, lon: -58.44 },
  BO: { name: "Bolívia", lat: -16.29, lon: -63.59 },
  VE: { name: "Venezuela", lat: 6.42, lon: -66.59 },
  GB: { name: "Reino Unido", lat: 55.38, lon: -3.44 },
  IE: { name: "Irlanda", lat: 53.41, lon: -8.24 },
  FR: { name: "França", lat: 46.23, lon: 2.21 },
  DE: { name: "Alemanha", lat: 51.17, lon: 10.45 },
  IT: { name: "Itália", lat: 41.87, lon: 12.57 },
  NL: { name: "Países Baixos", lat: 52.13, lon: 5.29 },
  BE: { name: "Bélgica", lat: 50.5, lon: 4.47 },
  CH: { name: "Suíça", lat: 46.82, lon: 8.23 },
  AT: { name: "Áustria", lat: 47.52, lon: 14.55 },
  SE: { name: "Suécia", lat: 60.13, lon: 18.64 },
  NO: { name: "Noruega", lat: 60.47, lon: 8.47 },
  DK: { name: "Dinamarca", lat: 56.26, lon: 9.5 },
  FI: { name: "Finlândia", lat: 61.92, lon: 25.75 },
  PL: { name: "Polónia", lat: 51.92, lon: 19.15 },
  RO: { name: "Roménia", lat: 45.94, lon: 24.97 },
  GR: { name: "Grécia", lat: 39.07, lon: 21.82 },
  TR: { name: "Turquia", lat: 38.96, lon: 35.24 },
  RU: { name: "Rússia", lat: 61.52, lon: 105.32 },
  UA: { name: "Ucrânia", lat: 48.38, lon: 31.17 },
  AO: { name: "Angola", lat: -11.2, lon: 17.87 },
  MZ: { name: "Moçambique", lat: -18.67, lon: 35.53 },
  CV: { name: "Cabo Verde", lat: 16.0, lon: -24.01 },
  ZA: { name: "África do Sul", lat: -30.56, lon: 22.94 },
  NG: { name: "Nigéria", lat: 9.08, lon: 8.68 },
  EG: { name: "Egito", lat: 26.82, lon: 30.8 },
  MA: { name: "Marrocos", lat: 31.79, lon: -7.09 },
  AE: { name: "Emirados Árabes", lat: 23.42, lon: 53.85 },
  IL: { name: "Israel", lat: 31.05, lon: 34.85 },
  IN: { name: "Índia", lat: 20.59, lon: 78.96 },
  CN: { name: "China", lat: 35.86, lon: 104.2 },
  JP: { name: "Japão", lat: 36.2, lon: 138.25 },
  KR: { name: "Coreia do Sul", lat: 35.91, lon: 127.77 },
  SG: { name: "Singapura", lat: 1.35, lon: 103.82 },
  ID: { name: "Indonésia", lat: -0.79, lon: 113.92 },
  TH: { name: "Tailândia", lat: 15.87, lon: 100.99 },
  PH: { name: "Filipinas", lat: 12.88, lon: 121.77 },
  AU: { name: "Austrália", lat: -25.27, lon: 133.78 },
  NZ: { name: "Nova Zelândia", lat: -40.9, lon: 174.89 },
};

/** Resolve um country code ISO para coordenadas e nome legível. */
export function resolveCountry(
  code: string | null | undefined,
): { name: string; lat: number; lon: number } | null {
  if (!code) return null;
  return COUNTRY_CENTROIDS[code.toUpperCase()] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Feed simulado                                                              */
/* -------------------------------------------------------------------------- */

const TOTAL_WEIGHT = CITIES.reduce((sum, c) => sum + c.weight, 0);

function pickCity(): CityRef {
  let ticket = Math.random() * TOTAL_WEIGHT;
  for (const city of CITIES) {
    ticket -= city.weight;
    if (ticket <= 0) return city;
  }
  return CITIES[0];
}

/** Espalha o ponto à volta da cidade para não empilhar tudo no mesmo pixel. */
function jitter(value: number, spread: number): number {
  return value + (Math.random() - 0.5) * spread;
}

let sequence = 0;

function spawnPoint(): LiveGlobePoint {
  const city = pickCity();
  sequence += 1;
  return {
    id: `sim-${sequence}`,
    lat: jitter(city.lat, 2.4),
    lon: jitter(city.lon, 2.8),
    country: city.country,
    countryCode: city.countryCode,
    city: city.city,
    users: 1 + Math.floor(Math.random() * Math.max(2, city.weight * 1.4)),
  };
}

export interface SimulationOptions {
  /** Quantos pontos existem no arranque. */
  initial?: number;
  /** Limite superior de pontos simultâneos. */
  max?: number;
  /** Intervalo mínimo/máximo entre atualizações, em ms. */
  intervalMs?: [number, number];
}

/**
 * Feed de tráfego simulado: a cada 2–3s nascem pontos novos, alguns morrem e
 * outros mudam de intensidade — o suficiente para o globo nunca parecer estático.
 */
export function useSimulatedLivePoints(
  options: SimulationOptions = {},
): LiveGlobePoint[] {
  const { initial = 18, max = 34, intervalMs = [2000, 3000] } = options;

  const [points, setPoints] = React.useState<LiveGlobePoint[]>(() =>
    Array.from({ length: initial }, spawnPoint),
  );

  const [minMs, maxMs] = intervalMs;

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      setPoints((current) => {
        const next = current
          // ~18% dos pontos saem do ar a cada ciclo
          .filter(() => Math.random() > 0.18)
          // e alguns dos que ficam oscilam de intensidade
          .map((point) =>
            Math.random() > 0.7
              ? {
                  ...point,
                  users: Math.max(
                    1,
                    point.users + (Math.random() > 0.5 ? 1 : -1),
                  ),
                }
              : point,
          );

        const room = max - next.length;
        const born = Math.min(room, 1 + Math.floor(Math.random() * 3));
        for (let i = 0; i < born; i++) next.push(spawnPoint());

        return next;
      });

      timer = setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
    };

    timer = setTimeout(tick, minMs);
    return () => clearTimeout(timer);
  }, [max, minMs, maxMs]);

  return points;
}
