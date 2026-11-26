/**
 * Guardia del modo discreto: mientras está activo, toda <title> muestra el título neutro y las
 * fotos de producto tienen un alt neutro. Guarda el valor real en data-real* para restaurarlo.
 *
 * Es UNA sola función autocontenida (sin imports ni closures) porque se usa en dos lados:
 * - inline en <head> (antes del primer pintado), serializada con `discreteBootScript`;
 * - en el cliente, al prender/apagar el modo desde el ojo del header.
 */
export function discreteGuard(enable: boolean, neutralTitle: string): void {
  const w = window as unknown as { __tsrGuard?: MutationObserver };
  const root = document.documentElement;
  const fix = () => {
    const titles = document.getElementsByTagName("title");
    for (let i = 0; i < titles.length; i++) {
      const t = titles[i]!;
      if (t.textContent !== neutralTitle) {
        t.setAttribute("data-real", t.textContent ?? "");
        t.textContent = neutralTitle;
      }
    }
    const imgs = document.querySelectorAll("img[data-product-img]");
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i]!;
      if (!img.hasAttribute("data-real-alt")) {
        img.setAttribute("data-real-alt", img.getAttribute("alt") ?? "");
        img.setAttribute("alt", "Foto de producto");
      }
    }
  };
  if (enable) {
    root.setAttribute("data-theme", "discreto");
    if (!w.__tsrGuard) {
      w.__tsrGuard = new MutationObserver(fix);
      w.__tsrGuard.observe(root, { subtree: true, childList: true, characterData: true });
    }
    fix();
    return;
  }
  root.setAttribute("data-theme", "claro");
  w.__tsrGuard?.disconnect();
  w.__tsrGuard = undefined;
  const titles = document.querySelectorAll("title[data-real]");
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i]!;
    t.textContent = t.getAttribute("data-real");
    t.removeAttribute("data-real");
  }
  const imgs = document.querySelectorAll("img[data-real-alt]");
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i]!;
    img.setAttribute("alt", img.getAttribute("data-real-alt") ?? "");
    img.removeAttribute("data-real-alt");
  }
}

/** Script inline para <head>: si la cookie dice discreto, activa la guardia antes de pintar. */
export function discreteBootScript(neutralTitle: string, cookieName: string): string {
  const args = `true,${JSON.stringify(neutralTitle)}`;
  return `(function(){try{if(/(?:^|; )${cookieName}=1(?:;|$)/.test(document.cookie)){(${discreteGuard.toString()})(${args})}}catch(e){}})()`;
}
