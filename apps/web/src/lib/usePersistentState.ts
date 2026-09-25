import { useEffect, useState } from "react";

/** Preferência simples do navegador (ex.: menu recolhido). Se o armazenamento falhar, usa o padrão. */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // modo privado ou armazenamento bloqueado: só não lembra
    }
  }, [key, value]);
  return [value, setValue];
}
