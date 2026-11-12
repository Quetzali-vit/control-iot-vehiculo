// Selección, inicio y cancelación de DEMO existentes. La secuencia la ejecuta el backend;
// aquí solo se refleja el avance que llega por WebSocket.
import { CONFIG } from "../config.js";
import { mensajeDeError } from "../utils/errores.js";

export function crearControlDemo({ servicios, store, obtenerClave, pedirClave, avisar }) {
  let iniciando = false;
  let cancelando = false;

  function manejarErrorClave(error, mensaje) {
    if (error?.status === 401 || error?.status === 403) {
      pedirClave(mensaje, error.status === 403);
      return true;
    }
    return false;
  }

  async function sincronizar() {
    try {
      const datos = await servicios.demoEnEjecucion();
      const actual = store.get().demoActiva;
      if (datos?.en_ejecucion) {
        if (!actual || actual.id !== datos.id_demo) {
          store.set({ demoActiva: { id: datos.id_demo, nombre: datos.demo, paso: null, total: null,
            comando: null, fase: "en_curso" } });
        }
      } else if (actual && actual.fase !== "solicitada") {
        store.set({ demoActiva: null });
      }
    } catch {
      // Si la consulta falla, se conserva lo que indique el WebSocket
    }
  }

  async function iniciar(idDemo) {
    const { demoActiva, demos } = store.get();
    if (demoActiva || iniciando) {
      avisar("Ya hay una DEMO en curso. Espera a que termine o cancélala.", "aviso");
      return;
    }
    const demo = demos.find((d) => d.id_demo === idDemo);
    if (!demo) {
      avisar("Elige una DEMO de la lista.", "aviso");
      return;
    }
    const clave = obtenerClave();
    if (!clave) {
      pedirClave("Escribe la clave de control para iniciar la DEMO.");
      return;
    }

    iniciando = true;
    store.set({ demoActiva: { id: idDemo, nombre: demo.nombre, paso: 0, total: null, comando: null, fase: "solicitada" } });
    try {
      const { status, datos } = await servicios.iniciarDemo(idDemo, clave);
      const actual = store.get().demoActiva;
      if (actual?.id === idDemo && actual.fase === "solicitada") {
        store.set({ demoActiva: { ...actual, total: datos?.total_movimientos ?? null, fase: "aceptada" } });
      }
      avisar(`DEMO «${demo.nombre}» aceptada por la API (${status}). Sigue el avance por WebSocket.`, "ok");
    } catch (error) {
      if (store.get().demoActiva?.fase === "solicitada") store.set({ demoActiva: null });
      const mensaje = mensajeDeError(error);
      if (!manejarErrorClave(error, mensaje)) avisar(`DEMO: ${mensaje}`, "error");
      if (error?.status === 409) sincronizar();
    } finally {
      iniciando = false;
    }
  }

  async function cancelar() {
    if (!store.get().demoActiva || cancelando) return;
    const clave = obtenerClave();
    if (!clave) {
      pedirClave("Escribe la clave de control para cancelar la DEMO.");
      return;
    }
    cancelando = true;
    try {
      const { datos } = await servicios.cancelarDemo(clave);
      avisar(datos?.mensaje || "Cancelación aceptada por la API.", "ok");
    } catch (error) {
      const mensaje = mensajeDeError(error);
      if (error?.status === 404) {
        store.set({ demoActiva: null });
        avisar("No había una DEMO en curso.", "aviso");
      } else if (!manejarErrorClave(error, mensaje)) {
        avisar(`Cancelar DEMO: ${mensaje}`, "error");
      }
    } finally {
      cancelando = false;
    }
  }

  function onEventoWs(evento) {
    if (!evento || evento.id_vehiculo !== CONFIG.VEHICLE_ID) return;
    const actual = store.get().demoActiva;

    switch (evento.evento) {
      case "demo_inicio":
        store.set({ demoActiva: { id: evento.id_demo, nombre: evento.demo, paso: 0,
          total: evento.total_movimientos ?? null, comando: null, fase: "en_curso" } });
        break;
      case "demo_movimiento":
        store.set({ demoActiva: { ...(actual || {}), id: evento.id_demo, nombre: evento.demo,
          paso: evento.orden ?? null, total: evento.total_movimientos ?? actual?.total ?? null,
          comando: evento.comando, codigo: evento.codigo, duracion: evento.duracion_ms, fase: "en_curso" } });
        break;
      case "demo_fin":
        store.set({ demoActiva: null });
        avisar(`DEMO «${evento.demo ?? ""}» terminada (evento demo_fin).`, "ok");
        break;
      case "demo_cancelada":
        store.set({ demoActiva: null });
        avisar(evento.mensaje || "DEMO cancelada.", "aviso");
        break;
      case "demo_error":
        store.set({ demoActiva: null });
        avisar(evento.mensaje || "La DEMO se detuvo por un error.", "error");
        break;
      default:
        break;
    }
  }

  return { iniciar, cancelar, onEventoWs, sincronizar };
}
