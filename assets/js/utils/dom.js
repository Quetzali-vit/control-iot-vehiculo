// Ayudas de DOM seguras: el texto de la API siempre entra con textContent.

export const $ = (selector, raiz = document) => raiz.querySelector(selector);

/**
 * Crea un elemento con atributos y texto seguro.
 * @param {string} etiqueta
 * @param {{clase?: string, texto?: string, atributos?: Record<string,string>}} [opciones]
 * @param {Node[]} [hijos]
 */
export function crear(etiqueta, { clase, texto, atributos } = {}, hijos = []) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  if (atributos) {
    for (const [nombre, valor] of Object.entries(atributos)) el.setAttribute(nombre, valor);
  }
  for (const hijo of hijos) el.append(hijo);
  return el;
}

/** Icono decorativo de Bootstrap Icons (oculto para lectores de pantalla). */
export function icono(nombre) {
  return crear("i", { clase: `bi ${nombre}`, atributos: { "aria-hidden": "true" } });
}

/** "GIRAR_IZQUIERDA" → "Girar izquierda" */
export function nombreLegible(nombre) {
  const texto = String(nombre ?? "").replace(/_/g, " ").trim().toLowerCase();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Sin nombre";
}

/** Hora local hh:mm:ss a partir de una marca ISO o Date. */
export function hora(valor = new Date()) {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "--:--:--";
  return fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
