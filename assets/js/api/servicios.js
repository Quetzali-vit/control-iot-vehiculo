// Operaciones reales de la API usadas por CONTROL (sin CRUD administrativo).
import { CONFIG, RUTAS } from "../config.js";
import { solicitar, ErrorApi } from "./cliente-http.js";

const ID = CONFIG.VEHICLE_ID;

function esLista(valor) {
  return Array.isArray(valor);
}

function exigir(condicion, mensaje) {
  if (!condicion) throw new ErrorApi("respuesta", mensaje);
}

export const servicios = {
  /** GET / → {"api","estado":"Online","documentacion"} */
  async estadoServicio({ signal } = {}) {
    const { datos } = await solicitar(RUTAS.servicio(), { timeoutMs: CONFIG.SALUD_TIMEOUT_MS, signal });
    return datos;
  },

  /** GET /salud → {"mensaje"} (200) o 503 si Amazon RDS no responde */
  async saludRds({ signal } = {}) {
    const { datos } = await solicitar(RUTAS.salud(), { timeoutMs: CONFIG.SALUD_TIMEOUT_MS, signal });
    return datos;
  },

  /** GET /vehiculos/{id} → datos del vehículo */
  async vehiculo() {
    const { datos } = await solicitar(RUTAS.vehiculo(ID));
    exigir(datos && typeof datos.id_vehiculo === "number", "Respuesta de vehículo no válida");
    return datos;
  },

  /** GET /vehiculos/{id}/estado → EstadoRespuesta: último estado reportado del vehículo */
  async ultimoEstado({ signal } = {}) {
    const { datos } = await solicitar(RUTAS.estado(ID), { signal });
    exigir(datos && datos.id_vehiculo === ID, "Respuesta de estado no válida");
    return datos;
  },

  /** GET /vehiculos/{id}/historial?limite=10 → los 10 movimientos individuales persistidos más recientes */
  async historial({ signal } = {}) {
    const { datos } = await solicitar(`${RUTAS.historial(ID)}?limite=10`, { signal });
    exigir(datos && esLista(datos.movimientos), "Respuesta de historial no válida");
    const movimientos = datos.movimientos
      .filter((m) => m && Number.isInteger(m.id_historial) && m.id_vehiculo === ID
        && typeof m.fecha_hora === "string")
      .sort((a, b) => b.id_historial - a.id_historial) // del más reciente al más antiguo
      .slice(0, 10);
    return {
      movimientos,
      total: Number.isInteger(datos.total_registrados) ? datos.total_registrados : null,
    };
  },

  /** GET /vehiculos/{id}/comandos → catálogo ordenado por código */
  async comandos() {
    const { datos } = await solicitar(RUTAS.comandos(ID));
    exigir(esLista(datos), "El catálogo de comandos no es una lista");
    return datos.filter((c) =>
      c && Number.isInteger(c.id_comando) && Number.isInteger(c.codigo) && typeof c.nombre === "string");
  },

  /** GET /vehiculos/{id}/demos → DEMO guardadas */
  async demos() {
    const { datos } = await solicitar(RUTAS.demos(ID));
    exigir(esLista(datos), "La lista de DEMO no es válida");
    return datos.filter((d) => d && Number.isInteger(d.id_demo) && typeof d.nombre === "string");
  },

  /** GET /vehiculos/{id}/demos/ejecucion → {en_ejecucion, id_demo?, demo?} */
  async demoEnEjecucion() {
    const { datos } = await solicitar(RUTAS.demoEjecucion(ID));
    return datos;
  },

  /** POST /vehiculos/{id}/movimientos (X-API-Key) → 201 MovimientoRespuesta */
  async ejecutarMovimiento(codigo, clave, { signal } = {}) {
    const { status, datos } = await solicitar(RUTAS.movimientos(ID), {
      metodo: "POST",
      cuerpo: { codigo, origen: CONFIG.ORIGEN },
      clave,
      signal,
    });
    return { status, datos };
  },

  /** POST /vehiculos/{id}/demos/{id_demo}/ejecutar (X-API-Key) → 202 */
  async iniciarDemo(idDemo, clave) {
    const { status, datos } = await solicitar(RUTAS.demoEjecutar(ID, idDemo), { metodo: "POST", clave });
    return { status, datos };
  },

  /** POST /vehiculos/{id}/demos/cancelar (X-API-Key) → 200 {"mensaje"} */
  async cancelarDemo(clave) {
    const { status, datos } = await solicitar(RUTAS.demoCancelar(ID), { metodo: "POST", clave });
    return { status, datos };
  },
};
