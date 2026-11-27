import { useEffect, useState } from "react";

const CHAVE = "bf-splash-visto";
/** Tempo total da abertura (a barra enche nesse tempo) e da saída suave. */
const DURACAO_MS = 2600;
const SAIDA_MS = 400;

function deveMostrar(): boolean {
  try {
    if (typeof window === "undefined") return false;
    // Navegador automatizado (testes), movimento reduzido e impressão: sem abertura.
    if (document.documentElement.dataset.motion === "off") return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (sessionStorage.getItem(CHAVE)) return false;
    sessionStorage.setItem(CHAVE, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Tela de abertura da marca, só no primeiro acesso de cada sessão do navegador (não a cada página).
 * Dá para pular com o botão ou com a tecla Esc. Só usa transform/opacity/clip-path e termina sozinha (nada fica girando).
 */
export function Splash() {
  const [ativa] = useState(deveMostrar);
  const [saindo, setSaindo] = useState(false);
  const [fim, setFim] = useState(false);

  useEffect(() => {
    if (!ativa) return;
    const t1 = setTimeout(() => setSaindo(true), DURACAO_MS);
    const t2 = setTimeout(() => setFim(true), DURACAO_MS + SAIDA_MS);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSaindo(true); };
    window.addEventListener("keydown", esc);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("keydown", esc); };
  }, [ativa]);

  useEffect(() => {
    if (!saindo || fim) return;
    const t = setTimeout(() => setFim(true), SAIDA_MS);
    return () => clearTimeout(t);
  }, [saindo, fim]);

  if (!ativa || fim) return null;
  return (
    <div className="splash" data-saindo={saindo} role="status" aria-label="Carregando o Backstage Flow" data-testid="splash">
      <div className="splash-grid" aria-hidden />
      <div className="splash-glow" aria-hidden />
      <div className="splash-centro">
        <div className="splash-logo">
          <img src="/brand/logo-dark.png" alt="Backstage Flow" width={1400} height={174} />
          <span className="splash-brilho" aria-hidden />
        </div>
        <p className="splash-frase">“Nos bastidores, o resultado ganha ritmo.”</p>
      </div>
      <div className="splash-linha" aria-hidden><i /></div>
      <button type="button" className="splash-pular" onClick={() => setSaindo(true)}>PULAR →</button>
    </div>
  );
}
