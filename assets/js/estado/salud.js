// Comprobación periódica y controlada de la API (GET /) y de Amazon RDS (GET /salud).
import { CONFIG } from "../config.js";

/**
 * @param {{ servicios: object, store: ReturnType<import("./store.js").crearStore> }} deps
 */
export function crearMonitorSalud({ servicios, store }) {
  let temporizador = null;
  let enCurso = null;

  async function comprobar() {
    if (enCurso) return enCurso;
    clearTimeout(temporizador);

    enCurso = (async () => {
      const previo = store.get().api;
      if (previo !== "disponible") store.set({ api: "comprobando", apiDetalle: "Consultando GET /" });

      // 1) Servidor AWS: GET / debe responder "estado": "Online"
      try {
        const datos = await servicios.estadoServicio();
        if (datos?.estado !== "Online") {
          store.set({ api: "no_disponible", apiDetalle: "GET / no respondió «Online»",
            rds: "sin_verificar", rdsDetalle: "Sin API no se puede comprobar" });
          return;
        }
        store.set({ api: "disponible", apiDetalle: `GET / respondió Online · ${new Date().toLocaleTimeString("es-MX")}` });
      } catch (error) {
        const detalle = error?.tipo === "timeout" ? "GET / sin respuesta a tiempo" : "GET / no respondió";
        // Sin API no hay evidencia sobre RDS: no se atribuye la falla a la base de datos
        store.set({ api: "no_disponible", apiDetalle: detalle,
          rds: "sin_verificar", rdsDetalle: "Sin API no se puede comprobar" });
        return;
      }

      // 2) Amazon RDS: diagnóstico seguro expuesto por el backend
      try {
        const datos = await servicios.saludRds();
        store.set({ rds: "disponible", rdsDetalle: datos?.mensaje || "GET /salud respondió 200" });
      } catch (error) {
        if (error?.status === 503) {
          store.set({ rds: "no_disponible", rdsDetalle: error.detalle || "GET /salud respondió 503" });
        } else {
          store.set({ rds: "sin_verificar", rdsDetalle: "GET /salud no dio un resultado válido" });
        }
      }
    })();

    try {
      await enCurso;
    } finally {
      enCurso = null;
      programar();
    }
  }

  function programar() {
    clearTimeout(temporizador);
    if (document.visibilityState === "hidden") return; // no se consulta con la pestaña oculta
    const todoBien = store.get().api === "disponible";
    temporizador = setTimeout(comprobar, todoBien ? CONFIG.SALUD_INTERVALO_MS : CONFIG.SALUD_REINTENTO_MS);
  }

  window.addEventListener("online", () => comprobar());
  window.addEventListener("offline", () => {
    clearTimeout(temporizador);
    store.set({ api: "no_disponible", apiDetalle: "Sin internet en este dispositivo",
      rds: "sin_verificar", rdsDetalle: "Sin API no se puede comprobar" });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") comprobar();
    else clearTimeout(temporizador);
  });

  return { iniciar: comprobar, comprobar };
}
