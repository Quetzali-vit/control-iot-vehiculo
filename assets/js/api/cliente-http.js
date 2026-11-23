// Cliente HTTP único: URL base, encabezados, tiempo límite, JSON y errores.
// 4.3: agrega el token de sesión (Authorization: Bearer) a cada petición y avisa
// a la aplicación cuando el servidor responde 401 (sesión vencida o revocada).
import { CONFIG } from "../config.js";
import { sesion } from "../estado/sesion.js";

/** Evento global: la API dijo que la sesión ya no sirve. */
export const EVENTO_SESION_VENCIDA = "control-iot:sesion-vencida";

export class ErrorApi extends Error {
  /**
   * @param {"red"|"timeout"|"cancelado"|"http"|"respuesta"} tipo
   * @param {string} mensaje
   * @param {{status?: number, detalle?: string}} [extra]
   */
  constructor(tipo, mensaje, { status = 0, detalle = "" } = {}) {
    super(mensaje);
    this.name = "ErrorApi";
    this.tipo = tipo;
    this.status = status;
    this.detalle = detalle;
  }
}

function leerDetalle(cuerpo) {
  if (!cuerpo || typeof cuerpo !== "object") return "";
  const { detail } = cuerpo;
  if (typeof detail === "string") return detail;
  // FastAPI responde 422 con una lista de errores de validación
  if (Array.isArray(detail) && detail.length > 0) {
    const primero = detail[0];
    return typeof primero?.msg === "string" ? primero.msg : "Datos de la solicitud no válidos";
  }
  return "";
}

/**
 * Realiza una solicitud a la API y devuelve { status, datos }.
 * Lanza ErrorApi en cualquier fallo (red, tiempo, HTTP, JSON inválido).
 */
export async function solicitar(ruta, {
  metodo = "GET",
  cuerpo,
  sinSesion = false,
  timeoutMs = CONFIG.HTTP_TIMEOUT_MS,
  signal,
} = {}) {
  const controlador = new AbortController();
  let porTiempo = false;
  const temporizador = setTimeout(() => {
    porTiempo = true;
    controlador.abort();
  }, timeoutMs);

  const cancelarExterno = () => controlador.abort();
  if (signal) {
    if (signal.aborted) controlador.abort();
    else signal.addEventListener("abort", cancelarExterno, { once: true });
  }

  const encabezados = { Accept: "application/json" };
  if (cuerpo !== undefined) encabezados["Content-Type"] = "application/json";
  const token = sinSesion ? "" : sesion.token();
  if (token) encabezados.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(CONFIG.API_BASE_URL + ruta, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: controlador.signal,
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
    });
  } catch (error) {
    if (controlador.signal.aborted) {
      throw porTiempo
        ? new ErrorApi("timeout", "La API tardó demasiado en responder")
        : new ErrorApi("cancelado", "Solicitud cancelada");
    }
    // fetch también llega aquí cuando CORS bloquea la respuesta
    throw new ErrorApi("red", "No hay conexión con la API");
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener("abort", cancelarExterno);
  }

  const texto = await respuesta.text();
  let datos = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new ErrorApi("respuesta", "La API devolvió una respuesta que no es JSON", {
        status: respuesta.status,
      });
    }
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401 && token) {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_VENCIDA, { detail: leerDetalle(datos) }));
    }
    throw new ErrorApi("http", `HTTP ${respuesta.status}`, {
      status: respuesta.status,
      detalle: leerDetalle(datos),
    });
  }

  return { status: respuesta.status, datos };
}
