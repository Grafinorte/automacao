import { useEffect, useState } from "react";

const LATITUDE = -23.5505;
const LONGITUDE = -51.4609;
const LOCATION_LABEL = "Apucarana/PR";

export interface WeatherInfo {
  temperature: number;
  description: string;
  icon: "sun" | "cloud" | "rain";
  location: string;
}

function describeWeatherCode(code: number): { description: string; icon: WeatherInfo["icon"] } {
  if (code === 0) return { description: "Céu limpo", icon: "sun" };
  if (code === 1 || code === 2) return { description: "Parcialmente nublado", icon: "cloud" };
  if (code === 3) return { description: "Nublado", icon: "cloud" };
  if (code === 45 || code === 48) return { description: "Neblina", icon: "cloud" };
  if ([51, 53, 55, 56, 57].includes(code)) return { description: "Garoa", icon: "rain" };
  if ([61, 63, 65, 66, 67].includes(code)) return { description: "Chuva", icon: "rain" };
  if ([71, 73, 75, 77].includes(code)) return { description: "Neve", icon: "rain" };
  if ([80, 81, 82].includes(code)) return { description: "Pancadas de chuva", icon: "rain" };
  if ([95, 96, 99].includes(code)) return { description: "Tempestade", icon: "rain" };
  return { description: "Tempo estável", icon: "sun" };
}

export function useWeather() {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&current_weather=true&timezone=America%2FSao_Paulo`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const current = data?.current_weather;
        if (!current) throw new Error("Sem dados de clima");
        const { description, icon } = describeWeatherCode(current.weathercode);
        setWeather({
          temperature: Math.round(current.temperature),
          description,
          icon,
          location: LOCATION_LABEL,
        });
      })
      .catch(() => setError(true));
  }, []);

  return { weather, error };
}
