'use strict';
/* Weersvoorspelling via Open-Meteo (gratis, geen API-sleutel nodig).
   Locatie instelbaar met WEATHER_PLACE, WEATHER_LAT en WEATHER_LON. */

const PLACE = process.env.WEATHER_PLACE || 'Utrecht';
const LAT = Number(process.env.WEATHER_LAT) || 52.0907;
const LON = Number(process.env.WEATHER_LON) || 5.1214;
const DAYS = 5;
const CACHE_MS = 30 * 60 * 1000;   // 30 minuten
const RETRY_MS = 5 * 60 * 1000;    // na een fout pas na 5 minuten opnieuw proberen

// WMO-weercodes → Nederlandse omschrijving + pictogram
const CODES = [
  [[0], 'Zonnig', '☀️'],
  [[1], 'Overwegend zonnig', '🌤️'],
  [[2], 'Half bewolkt', '⛅'],
  [[3], 'Bewolkt', '☁️'],
  [[45, 48], 'Mist', '🌫️'],
  [[51, 53, 55, 56, 57], 'Motregen', '🌦️'],
  [[61, 63, 66, 80, 81], 'Regen', '🌧️'],
  [[65, 67, 82], 'Zware regen', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Sneeuw', '🌨️'],
  [[95, 96, 99], 'Onweer', '⛈️'],
];
function describe(code) {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { label: hit[1], emoji: hit[2] } : { label: 'Onbekend', emoji: '🌡️' };
}

let cache = null;        // { at, data }
let lastError = 0;
let inflight = null;

async function fetchForecast() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: LAT, longitude: LON, timezone: 'Europe/Amsterdam', forecast_days: DAYS,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
  });
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open-Meteo gaf status ${r.status}`);
  const j = await r.json();
  const d = j.daily;
  if (!d || !Array.isArray(d.time)) throw new Error('Onverwacht antwoord van Open-Meteo');
  return {
    place: PLACE,
    days: d.time.map((date, i) => ({
      date,
      ...describe(d.weather_code[i]),
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      rain: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
      rainChance: d.precipitation_probability_max?.[i] ?? null,
      wind: Math.round(d.wind_speed_10m_max[i] ?? 0),
    })),
  };
}

async function getForecast() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  if (now - lastError < RETRY_MS) {
    if (cache) return { ...cache.data, stale: true };
    return { place: PLACE, days: [], unavailable: true };
  }
  inflight ||= fetchForecast().finally(() => { inflight = null; });
  try {
    const data = await inflight;
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    lastError = Date.now();
    console.warn('Weersvoorspelling niet beschikbaar:', e.message);
    if (cache) return { ...cache.data, stale: true };
    return { place: PLACE, days: [], unavailable: true };
  }
}

module.exports = { getForecast, describe };
