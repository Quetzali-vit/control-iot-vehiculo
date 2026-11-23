// Sesión WSS real del navegador con el servidor de AWS.
// Su estado indica la conexión de ESTE navegador, no la del vehículo físico.
//
// 4.3: el canal está protegido. El token de sesión viaja en la cadena de consulta
// (el navegador no puede mandar encabezados al abrir un WebSocket) y el servidor
// comprueba que esa persona tenga acceso a ESA unidad. Al cambiar de unidad se
// cierra la suscripción anterior antes de abrir la nueva: nunca hay dos a la vez.
import { CONFIG, RUTAS } from "../config.js";
import { vehiculoActual } from "../estado/contexto.js";
import { sesion } from "../estado/sesion.js";

// Códigos de cierre que manda la API (ver app/routers/websocket.py)
const CIERRE_SIN_SESION = 4401;
const CIERRE_SIN_PERMISO = 4403;
const CIERRE_NO_EXISTE = 4404;

/**
 * @param {{
 *   onEstado: (estado: "conectando"|"en_linea"|"reconectando"|"desconectado", detalle?: string) => void,
 *   onMensaje: (mensaje: object) => void,
 *   onSinSesion?: () => void,
 * }} opciones
 */
export function crearClienteWs({ onEstado, onMensaje, onSinSesion }) {
  const construirUrl = () =>
    `${CONFIG.WS_BASE_URL}${RUTAS.websocket(vehiculoActual())}?token=${encodeURIComponent(sesion.token())}`;
  // Para mostrar en pantalla, sin el token
  const urlVisible = () => CONFIG.WS_BASE_URL + RUTAS.websocket(vehiculoActual());

  let socket = null;
  let intentos = 0;
  let detenido = false;
  let temporizadorReconexion = null;
  let temporizadorPing = null;
  let temporizadorPong = null;

  function limpiarTemporizadores() {
    clearTimeout(temporizadorReconexion);
    clearInterval(temporizadorPing);
    clearTimeout(temporizadorPong);
    temporizadorReconexion = temporizadorPing = temporizadorPong = null;
  }

  function iniciarLatido() {
    clearInterval(temporizadorPing);
    temporizadorPing = setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send("ping");
      clearTimeout(temporizadorPong);
      // Si no llega ningún mensaje a tiempo, la sesión se da por perdida
      temporizadorPong = setTimeout(() => socket?.close(4000, "Sin respuesta al ping"), CONFIG.WS_PONG_TIMEOUT_MS);
    }, CONFIG.WS_PING_MS);
  }

  function programarReconexion(motivo) {
    if (detenido) return;
    const espera = Math.min(CONFIG.WS_RECONEXION_BASE_MS * 2 ** intentos, CONFIG.WS_RECONEXION_MAX_MS);
    const conAzar = Math.round(espera * (0.8 + Math.random() * 0.4));
    intentos += 1;
    onEstado("desconectado", `${motivo}. Reintento en ${Math.ceil(conAzar / 1000)} s`);
    clearTimeout(temporizadorReconexion);
    temporizadorReconexion = setTimeout(abrir, conAzar);
  }

  function abrir() {
    if (detenido) return;
    if (!navigator.onLine) {
      onEstado("desconectado", "Sin internet en este dispositivo");
      return; // se reintenta con el evento "online"
    }
    clearTimeout(temporizadorReconexion);
    if (!sesion.token()) {
      onEstado("desconectado", "Sin sesión");
      return;
    }
    onEstado(intentos === 0 ? "conectando" : "reconectando", urlVisible());

    let ws;
    try {
      ws = new WebSocket(construirUrl());
    } catch {
      programarReconexion("No se pudo abrir el WebSocket");
      return;
    }
    socket = ws;

    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      intentos = 0;
      onEstado("en_linea", urlVisible());
      iniciarLatido();
    });

    ws.addEventListener("message", (evento) => {
      if (socket !== ws) return;
      clearTimeout(temporizadorPong);
      let mensaje;
      try {
        mensaje = JSON.parse(evento.data);
      } catch {
        return; // mensaje no JSON: se ignora
      }
      if (mensaje && typeof mensaje === "object") onMensaje(mensaje);
    });

    ws.addEventListener("close", (evento) => {
      if (socket !== ws) return;
      socket = null;
      clearInterval(temporizadorPing);
      clearTimeout(temporizadorPong);
      if (detenido) {
        onEstado("desconectado", "Conexión cerrada");
        return;
      }
      if (evento.code === CIERRE_SIN_SESION) {
        // La sesión venció o se cerró: reintentar no sirve de nada
        onEstado("desconectado", "La sesión terminó");
        onSinSesion?.();
        return;
      }
      if (evento.code === CIERRE_SIN_PERMISO || evento.code === CIERRE_NO_EXISTE) {
        onEstado("desconectado", evento.code === CIERRE_NO_EXISTE
          ? "La unidad no existe o no es tuya"
          : "Sin permiso sobre esta unidad");
        return;
      }
      programarReconexion("Se perdió la conexión");
    });
    // "error" siempre va seguido de "close"; el estado se actualiza ahí.
  }

  function reconectarAhora() {
    if (detenido) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    intentos = Math.max(intentos, 1);
    abrir();
  }

  window.addEventListener("online", reconectarAhora);
  window.addEventListener("offline", () => socket?.close(4001, "Sin internet"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconectarAhora();
  });

  return {
    conectar() {
      detenido = false;
      intentos = 0;
      abrir();
    },
    reconectarAhora,
    /** Cierra la suscripción de la unidad anterior y abre la de la unidad actual. */
    reabrir() {
      detenido = false;
      intentos = 0;
      limpiarTemporizadores();
      const viejo = socket;
      socket = null;            // los eventos del socket viejo se ignoran desde ya
      try {
        viejo?.close(1000, "Cambio de unidad");
      } catch {
        // ya estaba cerrado
      }
      abrir();
    },
    /** Pide al servidor el estado guardado (mensaje "estado" del protocolo). */
    pedirEstado() {
      if (socket?.readyState === WebSocket.OPEN) socket.send("estado");
    },
    cerrar() {
      detenido = true;
      limpiarTemporizadores();
      socket?.close(1000, "Cierre solicitado");
    },
  };
}
