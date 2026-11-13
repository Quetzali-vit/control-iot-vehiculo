// Configuración pública de la aplicación de control.

export const CONFIG = Object.freeze({
  // X-API-Key escrita directamente (decisión del operador, 2026-11-12).
  // ATENCIÓN: este repositorio es público, así que cualquiera que lea este archivo
  // puede controlar el vehículo. Si se filtra o hay abuso, cambia la clave en el
  // backend y actualízala aquí. Déjala en "" para que la página la pida en «Clave».
  API_KEY: "Admin1234#",

  // API existente en AWS (FastAPI detrás de Caddy, HTTPS)
  API_BASE_URL: "https://quetzali-iot.duckdns.org",

  // WebSocket del vehículo (WSS). La ruta real es /ws/vehiculos/{id_vehiculo}
  WS_BASE_URL: "wss://quetzali-iot.duckdns.org",

  // Vehículo de prueba
  VEHICLE_ID: 1,

  // Se guarda en historial_comandos como "origen" (letras, números, _ y -)
  ORIGEN: "WEB-CONTROL",

  // Comandos del catálogo que maneja el joystick (por su nombre real en la API)
  JOYSTICK: Object.freeze({
    arriba: "AVANZAR",
    abajo: "RETROCEDER",
    izquierda: "GIRAR_IZQUIERDA",
    derecha: "GIRAR_DERECHA",
  }),
  // Joystick derecho: brazo (arriba/abajo) y pala (izquierda/derecha)
  JOYSTICK_BRAZO: Object.freeze({
    arriba: "SUBIR_BRAZO",
    abajo: "BAJAR_BRAZO",
    izquierda: "ABRIR_PALA",
    derecha: "CERRAR_PALA",
  }),
  COMANDO_DETENER: "DETENER",

  // Comandos del catálogo que NO se dibujan como botón
  COMANDOS_OCULTOS: Object.freeze(["LUZ"]),

  // Tiempos (milisegundos)
  HTTP_TIMEOUT_MS: 8000,
  SALUD_INTERVALO_MS: 20000,      // cada cuánto se comprueban API y RDS si todo está bien
  SALUD_REINTENTO_MS: 10000,      // cada cuánto se reintenta si algo falló
  SALUD_TIMEOUT_MS: 6000,
  WS_PING_MS: 25000,              // el servidor responde "pong" al texto "ping"
  WS_PONG_TIMEOUT_MS: 8000,
  WS_RECONEXION_BASE_MS: 1000,
  WS_RECONEXION_MAX_MS: 15000,
  BOTON_ENFRIAMIENTO_MS: 350,     // evita ráfagas por doble toque
  CORRELACION_WS_MS: 15000,       // ventana para relacionar respuesta HTTP con evento WS
  MOVIMIENTO_VISUAL_MS: 2200,     // cuánto se muestra un movimiento como activo (el ESP32 lo ejecuta ~2 s)
  REGISTRO_MAX: 6,                // acciones visibles en "Registro"
});

// Rutas reales de la API (tomadas de Swagger /openapi.json). No inventar otras.
export const RUTAS = Object.freeze({
  servicio: () => "/",
  salud: () => "/salud",
  vehiculo: (id) => `/vehiculos/${id}`,
  comandos: (id) => `/vehiculos/${id}/comandos`,
  movimientos: (id) => `/vehiculos/${id}/movimientos`,
  demos: (id) => `/vehiculos/${id}/demos`,
  demoEjecucion: (id) => `/vehiculos/${id}/demos/ejecucion`,
  demoEjecutar: (id, idDemo) => `/vehiculos/${id}/demos/${idDemo}/ejecutar`,
  demoCancelar: (id) => `/vehiculos/${id}/demos/cancelar`,
  websocket: (id) => `/ws/vehiculos/${id}`,
});
