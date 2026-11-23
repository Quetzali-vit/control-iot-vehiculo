// Configuración pública de la aplicación (CONTROL + MONITOREO + ADMINISTRACIÓN).
//
// Práctica 4.3: aquí ya NO va ninguna clave. Cada persona inicia sesión y la API
// le entrega un token temporal; los permisos los decide el servidor por rol y por
// unidad. La antigua X-API-Key quedó solo para el dispositivo (ESP32), nunca en
// el navegador.

export const CONFIG = Object.freeze({
  // API existente en AWS (FastAPI detrás de Caddy, HTTPS)
  API_BASE_URL: "https://quetzali-iot.duckdns.org",

  // WebSocket del vehículo (WSS). La ruta real es /ws/vehiculos/{id_vehiculo}?token=...
  WS_BASE_URL: "wss://quetzali-iot.duckdns.org",

  // Unidad que se abre si la persona aún no eligió otra
  VEHICLE_ID_POR_DEFECTO: 1,

  // Se guarda en historial_comandos como "origen" (el servidor lo ajusta por rol)
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

  // Límites del editor de demos (el servidor vuelve a validar)
  DEMO_PASO_MIN_MS: 100,
  DEMO_PASO_MAX_MS: 10000,
  DEMO_PAUSA_MAX_MS: 10000,
  DEMO_MAX_PASOS: 30,

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
  MONITOREO_RESINC_MS: 450,       // espera tras un evento WSS antes de pedir el historial persistido
});

// Rutas reales de la API (Swagger /openapi.json). No inventar otras.
export const RUTAS = Object.freeze({
  servicio: () => "/",
  salud: () => "/salud",
  vehiculo: (id) => `/vehiculos/${id}`,
  estado: (id) => `/vehiculos/${id}/estado`,
  historial: (id) => `/vehiculos/${id}/historial`,
  comandos: (id) => `/vehiculos/${id}/comandos`,
  movimientos: (id) => `/vehiculos/${id}/movimientos`,
  demos: (id) => `/vehiculos/${id}/demos`,
  demo: (id, idDemo) => `/vehiculos/${id}/demos/${idDemo}`,
  demoEjecucion: (id) => `/vehiculos/${id}/demos/ejecucion`,
  demoEjecutar: (id, idDemo) => `/vehiculos/${id}/demos/${idDemo}/ejecutar`,
  demoCancelar: (id) => `/vehiculos/${id}/demos/cancelar`,
  demoPasos: (id, idDemo) => `/vehiculos/${id}/demos/${idDemo}/movimientos`,
  websocket: (id) => `/ws/vehiculos/${id}`,

  // ----- 4.3 -----
  login: () => "/auth/login",
  logout: () => "/auth/logout",
  yo: () => "/auth/yo",
  misVehiculos: () => "/mis-vehiculos",
  catalogo: () => "/catalogo",
  pruebas: () => "/invitados/pruebas",
  pruebaActual: () => "/invitados/pruebas/actual",
  pruebaTerminar: () => "/invitados/pruebas/terminar",
  metricas: () => "/admin/metricas",
  usuarios: () => "/admin/usuarios",
  usuario: (id) => `/admin/usuarios/${id}`,
  modelos: () => "/admin/modelos",
  modelo: (id) => `/admin/modelos/${id}`,
  unidades: () => "/admin/unidades",
  unidad: (id) => `/admin/unidades/${id}`,
  auditoria: (limite = 50) => `/admin/auditoria?limite=${limite}`,
});
