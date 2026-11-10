// Coordinador ÚNICO de comandos: lo usan el joystick y todos los botones.
// Reglas: un movimiento a la vez, el último pedido gana, DETENER tiene prioridad
// y las respuestas tardías no vuelven a activar un movimiento ya detenido.
import { CONFIG } from "../config.js";
import { mensajeDeError } from "../utils/errores.js";

/**
 * @param {{
 *   servicios: object,
 *   store: object,
 *   obtenerClave: () => string,
 *   pedirClave: (mensaje: string, invalida?: boolean) => void,
 *   avisar: (mensaje: string, tipo?: "ok"|"aviso"|"error") => void,
 * }} deps
 */
export function crearCoordinador({ servicios, store, obtenerClave, pedirClave, avisar }) {
  let secuencia = 0;
  let enVuelo = null;          // movimiento en camino: { id, codigo }
  let siguiente = null;        // movimiento en espera (solo uno; el último gana)
  let ultimoStop = 0;          // id del último DETENER solicitado
  let stopAceptado = 0;        // id del último DETENER aceptado por la API
  let respaldoPara = 0;        // evita enviar más de un DETENER de respaldo por cada DETENER

  const porNombre = (nombre) => store.get().catalogo.find((c) => c.nombre === nombre);

  // ----- Registro de acciones (solicitado → aceptado por API → evento recibido) -----
  function agregarRegistro(comando, fuente, fase = "solicitado") {
    const registro = {
      id: ++secuencia,
      nombre: comando.nombre,
      codigo: comando.codigo,
      fuente,
      fase,                    // en_cola | solicitado | aceptado | superado | descartado | error
      http: null,
      ws: false,
      wsHora: null,
      hora: new Date().toISOString(),
      mensaje: "",
    };
    const acciones = [registro, ...store.get().acciones].slice(0, CONFIG.REGISTRO_MAX);
    store.set({ acciones });
    return registro;
  }

  function actualizarRegistro(id, cambios) {
    const acciones = store.get().acciones.map((r) => (r.id === id ? { ...r, ...cambios } : r));
    store.set({ acciones });
  }

  function claveOPedir(mensaje) {
    const clave = obtenerClave();
    if (!clave) pedirClave(mensaje);
    return clave;
  }

  // ----- Envío real (POST /vehiculos/{id}/movimientos) -----
  async function enviarAhora(comando, registro) {
    const esStop = comando.nombre === CONFIG.COMANDO_DETENER;
    const clave = obtenerClave();
    if (!esStop) enVuelo = { id: registro.id, codigo: comando.codigo };
    actualizarRegistro(registro.id, { fase: "solicitado" });

    try {
      const { status } = await servicios.ejecutarMovimiento(comando.codigo, clave);

      if (esStop) {
        stopAceptado = Math.max(stopAceptado, registro.id);
        actualizarRegistro(registro.id, { fase: "aceptado", http: status });
        return { ok: true };
      }

      // Respuesta tardía de un movimiento pedido ANTES del último DETENER
      if (registro.id < ultimoStop) {
        actualizarRegistro(registro.id, { fase: "superado", http: status });
        // Si DETENER ya se aceptó antes que este movimiento, se reafirma la detención
        if (stopAceptado >= ultimoStop && respaldoPara !== ultimoStop) {
          respaldoPara = ultimoStop;
          detener("respaldo");
        }
        return { ok: false, motivo: "superado" };
      }

      actualizarRegistro(registro.id, { fase: "aceptado", http: status });
      return { ok: true };
    } catch (error) {
      const mensaje = mensajeDeError(error);
      actualizarRegistro(registro.id, { fase: "error", http: error?.status || null, mensaje });
      if (error?.status === 401 || error?.status === 403) pedirClave(mensaje, error.status === 403);
      else avisar(`${comando.nombre}: ${mensaje}`, "error");
      return { ok: false, motivo: "error", error };
    } finally {
      if (!esStop) {
        enVuelo = null;
        despacharSiguiente();
      }
    }
  }

  function despacharSiguiente() {
    if (!siguiente || enVuelo) return;
    const pendiente = siguiente;
    siguiente = null;
    enviarAhora(pendiente.comando, pendiente.registro).then(pendiente.resolver);
  }

  function descartarSiguiente(motivo) {
    if (!siguiente) return;
    actualizarRegistro(siguiente.registro.id, { fase: "descartado" });
    siguiente.resolver({ ok: false, motivo });
    siguiente = null;
  }

  // ----- API pública -----
  function detener(fuente = "boton") {
    const comando = porNombre(CONFIG.COMANDO_DETENER);
    if (!comando) {
      avisar("El catálogo del vehículo no tiene DETENER.", "error");
      return Promise.resolve({ ok: false, motivo: "sin_detener" });
    }
    // Soltar el joystick después de un DETENER ya pedido no lo repite
    const ultimo = store.get().acciones[0];
    if (fuente === "joystick" && !enVuelo && !siguiente &&
        ultimo?.nombre === CONFIG.COMANDO_DETENER && ultimo.fase !== "error") {
      return Promise.resolve({ ok: true, motivo: "ya_detenido" });
    }
    if (!claveOPedir("Escribe la clave de control para poder detener.")) {
      return Promise.resolve({ ok: false, motivo: "sin_clave" });
    }
    descartarSiguiente("detenido");
    const registro = agregarRegistro(comando, fuente);
    ultimoStop = registro.id;
    // DETENER no espera a nadie: sale de inmediato, aunque haya otro movimiento en camino
    return enviarAhora(comando, registro);
  }

  function solicitar(comando, fuente) {
    if (!comando) return Promise.resolve({ ok: false, motivo: "sin_comando" });
    if (comando.nombre === CONFIG.COMANDO_DETENER) return detener(fuente);

    if (store.get().demoActiva) {
      avisar("Hay una DEMO en curso. Cancélala o pulsa DETENER.", "aviso");
      return Promise.resolve({ ok: false, motivo: "demo" });
    }
    if (!claveOPedir("Escribe la clave de control para mover el vehículo.")) {
      return Promise.resolve({ ok: false, motivo: "sin_clave" });
    }
    // El mismo comando ya va en camino: no se duplica
    if (enVuelo && enVuelo.codigo === comando.codigo && !siguiente) {
      return Promise.resolve({ ok: false, motivo: "duplicado" });
    }

    if (enVuelo) {
      descartarSiguiente("reemplazado");
      const registro = agregarRegistro(comando, fuente, "en_cola");
      return new Promise((resolver) => {
        siguiente = { comando, registro, resolver };
      });
    }

    const registro = agregarRegistro(comando, fuente);
    return enviarAhora(comando, registro);
  }

  /** Relaciona un evento "movimiento" del WebSocket con la acción que lo produjo. */
  function registrarEventoWs(evento) {
    if (evento?.evento !== "movimiento" || evento.id_vehiculo !== CONFIG.VEHICLE_ID) return;
    const limite = Date.now() - CONFIG.CORRELACION_WS_MS;
    const candidatos = store.get().acciones.filter((r) =>
      !r.ws &&
      r.codigo === evento.codigo &&
      ["solicitado", "aceptado", "superado"].includes(r.fase) &&
      new Date(r.hora).getTime() >= limite);
    const masAntiguo = candidatos[candidatos.length - 1];
    if (masAntiguo) actualizarRegistro(masAntiguo.id, { ws: true, wsHora: evento.timestamp || new Date().toISOString() });
  }

  return {
    solicitar,
    detener,
    solicitarPorNombre: (nombre, fuente) => solicitar(porNombre(nombre), fuente),
    registrarEventoWs,
    porNombre,
  };
}
