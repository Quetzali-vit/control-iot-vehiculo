// Estado de la interfaz en un solo lugar. Los módulos lo leen y se suscriben a cambios.

export function crearStore(inicial) {
  let estado = { ...inicial };
  const suscriptores = new Set();

  return {
    get: () => estado,
    set(parcial) {
      estado = { ...estado, ...parcial };
      for (const fn of suscriptores) fn(estado);
    },
    subscribe(fn) {
      suscriptores.add(fn);
      return () => suscriptores.delete(fn);
    },
  };
}

export const ESTADO_INICIAL = Object.freeze({
  vehiculo: null,            // {id_vehiculo, nombre, ...}
  catalogo: [],              // comandos activos del vehículo
  catalogoListo: false,
  demos: [],                 // DEMO activas
  demoActiva: null,          // {id, nombre, paso, total, comando, fase}
  hayClave: false,
  encendido: false,          // el botón ENCENDER_APAGAR alterna este valor (el ESP32 también alterna)
  sonido: true,              // el carrito suena desde que se enciende; el botón SONIDO lo alterna
  activo: null,              // control en uso: "traccion" | "brazo" | "boton:<codigo>" | null (todo libre)

  ws: "conectando",          // en_linea | conectando | reconectando | desconectado
  wsDetalle: "",
  api: "comprobando",        // disponible | comprobando | no_disponible
  apiDetalle: "",
  rds: "sin_verificar",      // disponible | no_disponible | sin_verificar
  rdsDetalle: "",

  acciones: [],              // registro de acciones (más reciente primero)
  ultimoEvento: null,        // último mensaje WebSocket recibido

  // ----- MONITOREO (práctica 4.2) -----
  ultimoMovimiento: null,    // {comando, codigo, fecha, conectado, vehiculo, origen:"rest"|"wss", esDemo?}
  estadoCargando: false,
  estadoError: "",
  historial: [],             // hasta 10 HistorialItem persistidos, del más reciente al más antiguo
  historialTotal: null,      // total_registrados que informa la API
  historialListo: false,
  historialCargando: false,
  historialError: "",
  monitoreoSincronizado: "", // "carga" | "reconexion": por qué se consultó la última vez
});
