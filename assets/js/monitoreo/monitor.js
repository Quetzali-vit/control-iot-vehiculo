// MONITOREO: carga inicial por REST y resincronización disparada por WebSocket.
//
// Reglas de negocio que se respetan aquí:
// - El último movimiento sale de GET /vehiculos/{id}/estado y se actualiza con
//   eventos WSS válidos del MISMO vehículo, vengan de donde vengan.
// - La tabla solo muestra movimientos INDIVIDUALES persistidos que devuelve
//   GET /vehiculos/{id}/historial. Un evento WSS nunca se inserta directamente:
//   dispara una consulta al historial confirmado.
// - Los pasos internos de una DEMO (demo_movimiento) actualizan la tarjeta de
//   último estado, pero NO piden historial: el backend no los persiste.
// - Una respuesta REST vieja jamás sobrescribe información más nueva (se comparan
//   los sellos de cada petición y la marca temporal del estado).
import { CONFIG } from "../config.js";
import { mensajeDeError } from "../utils/errores.js";
import { aFecha } from "../utils/fechas.js";

// Eventos WSS que SÍ corresponden a un movimiento individual persistido
const EVENTOS_MOVIMIENTO = new Set(["movimiento"]);
// Eventos de DEMO: actualizan la tarjeta, no el historial individual
const EVENTOS_DEMO_ESTADO = new Set(["demo_movimiento", "demo_inicio", "demo_fin", "demo_cancelada"]);

export function crearMonitor({ servicios, store, avisar }) {
  // Sellos crecientes: descartan respuestas que lleguen fuera de orden
  let selloEstado = 0;
  let selloHistorial = 0;
  let ultimoEstadoAplicado = 0;
  let ultimoHistorialAplicado = 0;
  let historialPendiente = null;   // temporizador de la resincronización agrupada
  let historialEnCurso = false;
  let historialRepetir = false;

  /** Normaliza EstadoRespuesta a lo que pinta la tarjeta. */
  function aUltimoMovimiento(datos, origen) {
    return {
      comando: datos.comando ?? null,
      codigo: Number.isInteger(datos.codigo) ? datos.codigo : null,
      fecha: datos.fecha_actualizacion ?? null,
      conectado: Boolean(datos.conectado),
      vehiculo: datos.vehiculo ?? null,
      origen,                       // "rest" | "wss"
      recibido: Date.now(),
    };
  }

  /** ¿La información nueva es posterior a la que ya está en pantalla? */
  function esMasNuevo(nuevo, actual) {
    if (!actual) return true;
    const fNuevo = aFecha(nuevo.fecha);
    const fActual = aFecha(actual.fecha);
    if (fNuevo && fActual && fNuevo.getTime() !== fActual.getTime()) return fNuevo > fActual;
    // Con la misma marca (o sin marca), un evento WSS gana a una respuesta REST:
    // el WebSocket avisa antes de que el GET alcance a reflejarlo.
    if (nuevo.origen === "wss" && actual.origen === "rest") return true;
    if (nuevo.origen === "rest" && actual.origen === "wss") return false;
    return true;
  }

  // ----- Último estado por REST -----
  async function cargarEstado() {
    const sello = ++selloEstado;
    store.set({ estadoCargando: true });
    try {
      const datos = await servicios.ultimoEstado();
      if (sello < ultimoEstadoAplicado) return;           // respuesta atrasada
      ultimoEstadoAplicado = sello;
      const nuevo = aUltimoMovimiento(datos, "rest");
      const actual = store.get().ultimoMovimiento;
      if (esMasNuevo(nuevo, actual)) store.set({ ultimoMovimiento: nuevo });
      store.set({ estadoCargando: false, estadoError: "" });
    } catch (error) {
      if (sello < ultimoEstadoAplicado) return;
      store.set({ estadoCargando: false, estadoError: mensajeDeError(error) });
    }
  }

  // ----- Historial persistido por REST -----
  async function cargarHistorial() {
    if (historialEnCurso) {          // evita consultas simultáneas
      historialRepetir = true;
      return;
    }
    historialEnCurso = true;
    const sello = ++selloHistorial;
    store.set({ historialCargando: true });
    try {
      const { movimientos, total } = await servicios.historial();
      if (sello >= ultimoHistorialAplicado) {
        ultimoHistorialAplicado = sello;
        store.set({ historial: movimientos, historialTotal: total,
          historialCargando: false, historialError: "", historialListo: true });
      }
    } catch (error) {
      if (sello >= ultimoHistorialAplicado) {
        store.set({ historialCargando: false, historialError: mensajeDeError(error) });
      }
    } finally {
      historialEnCurso = false;
      if (historialRepetir) {        // llegaron más eventos mientras se consultaba
        historialRepetir = false;
        programarHistorial(0);
      }
    }
  }

  /**
   * Agrupa varios eventos seguidos en una sola consulta al historial.
   * El backend escribe el registro justo después de publicar el evento, así que
   * se espera un momento antes de preguntar por la persistencia confirmada.
   */
  function programarHistorial(espera = CONFIG.MONITOREO_RESINC_MS) {
    clearTimeout(historialPendiente);
    historialPendiente = setTimeout(cargarHistorial, espera);
  }

  /** Carga inicial (al abrir MONITOREO) y resincronización tras reconectar. */
  async function sincronizar({ motivo = "carga" } = {}) {
    clearTimeout(historialPendiente);
    store.set({ monitoreoSincronizado: motivo });
    await Promise.allSettled([cargarEstado(), cargarHistorial()]);
  }

  /** Eventos del WebSocket compartido con CONTROL. */
  function onEventoWs(evento) {
    if (!evento || typeof evento !== "object") return;
    if (evento.id_vehiculo !== undefined && evento.id_vehiculo !== CONFIG.VEHICLE_ID) return;
    const tipo = evento.evento;
    if (tipo === "pong") return;

    // "estado_actual" lo manda el servidor al conectarse: refleja lo guardado
    if (tipo === "estado_actual" || EVENTOS_MOVIMIENTO.has(tipo) || EVENTOS_DEMO_ESTADO.has(tipo)) {
      if (typeof evento.comando === "string") {
        const nuevo = {
          comando: evento.comando,
          codigo: Number.isInteger(evento.codigo) ? evento.codigo : null,
          fecha: evento.timestamp ?? null,
          conectado: typeof evento.conectado === "boolean" ? evento.conectado
            : Boolean(store.get().ultimoMovimiento?.conectado),
          vehiculo: store.get().ultimoMovimiento?.vehiculo ?? null,
          origen: tipo === "estado_actual" ? "rest" : "wss",
          esDemo: EVENTOS_DEMO_ESTADO.has(tipo),
          recibido: Date.now(),
        };
        if (esMasNuevo(nuevo, store.get().ultimoMovimiento)) store.set({ ultimoMovimiento: nuevo });
      }
    }

    // Solo un movimiento individual pide el historial confirmado.
    // Los pasos de DEMO no se guardan en historial_comandos, así que no se consulta.
    if (EVENTOS_MOVIMIENTO.has(tipo)) programarHistorial();
  }

  /** Tras recuperar el WebSocket se vuelve a leer todo: pudo perderse algún evento. */
  function onReconexionWs() {
    sincronizar({ motivo: "reconexion" });
    avisar?.("WebSocket recuperado: se volvió a consultar el estado y el historial.", "ok");
  }

  return { sincronizar, onEventoWs, onReconexionWs, cargarHistorial, cargarEstado };
}
