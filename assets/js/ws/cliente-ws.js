// Sesión WSS real del navegador con el servidor de AWS.
// Su estado indica la conexión de ESTE navegador, no la del vehículo físico.
import { CONFIG, RUTAS } from "../config.js";

/**
 * @param {{
 *   onEstado: (estado: "conectando"|"en_linea"|"reconectando"|"desconectado", detalle?: string) => void,
 *   onMensaje: (mensaje: object) => void,
 * }} opciones
 */
export function crearClienteWs({ onEstado, onMensaje }) {
  const url = CONFIG.WS_BASE_URL + RUTAS.websocket(CONFIG.VEHICLE_ID);

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
    onEstado(intentos === 0 ? "conectando" : "reconectando", url);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      programarReconexion("No se pudo abrir el WebSocket");
      return;
    }
    socket = ws;

    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      intentos = 0;
      onEstado("en_linea", url);
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
      const motivo = evento.code === 4404
        ? "El vehículo no existe en la API"
        : "Se perdió la conexión";
      programarReconexion(motivo);
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
