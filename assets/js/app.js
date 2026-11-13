// Punto de entrada: crea los módulos y los conecta entre sí.
import { CONFIG } from "./config.js";
import { servicios } from "./api/servicios.js";
import { crearStore, ESTADO_INICIAL } from "./estado/store.js";
import { crearMonitorSalud } from "./estado/salud.js";
import { crearClienteWs } from "./ws/cliente-ws.js";
import { crearCoordinador } from "./control/comandos.js";
import { crearControlDemo } from "./control/demo.js";
import { crearJoystick, TECLAS_TRACCION, TECLAS_BRAZO } from "./control/joystick.js";
import { crearMonitor } from "./monitoreo/monitor.js";
import { crearIndicadores } from "./ui/indicadores.js";
import { crearVistaMonitoreo } from "./ui/monitoreo.js";
import { crearBotones } from "./ui/botones.js";
import { crearPanelDemo } from "./ui/demo.js";
import { crearMensajes } from "./ui/mensajes.js";
import { crearClave } from "./ui/clave.js";
import { $, nombreLegible } from "./utils/dom.js";
import { mensajeDeError } from "./utils/errores.js";

const store = crearStore(ESTADO_INICIAL);
const { avisar } = crearMensajes(store);
const clave = crearClave(store);

const deps = { servicios, store, obtenerClave: clave.obtener, pedirClave: clave.pedir, avisar };
const coordinador = crearCoordinador(deps);
const controlDemo = crearControlDemo(deps);
const salud = crearMonitorSalud({ servicios, store });
// MONITOREO (4.2): comparte el mismo WebSocket y el mismo cliente REST que CONTROL
const monitor = crearMonitor({ servicios, store, avisar });

// ----- WebSocket del navegador -----
const ws = crearClienteWs({
  onEstado: (estado, detalle = "") => {
    const anterior = store.get().ws;
    store.set({ ws: estado, wsDetalle: detalle });
    // Al recuperar la sesión se sincroniza la DEMO por si hubo eventos perdidos
    if (estado === "en_linea" && anterior !== "en_linea" && store.get().catalogoListo) {
      controlDemo.sincronizar();
      // Reconexión: se vuelve a leer estado e historial por REST (pudieron perderse eventos)
      if (anterior === "desconectado" || anterior === "reconectando") monitor.onReconexionWs();
    }
  },
  onMensaje: (mensaje) => {
    if (mensaje.id_vehiculo !== undefined && mensaje.id_vehiculo !== CONFIG.VEHICLE_ID) return;
    if (mensaje.evento !== "pong") store.set({ ultimoEvento: mensaje });
    coordinador.registrarEventoWs(mensaje);
    controlDemo.onEventoWs(mensaje);
    monitor.onEventoWs(mensaje);
    if (mensaje.evento === "error" && typeof mensaje.mensaje === "string") avisar(`WebSocket: ${mensaje.mensaje}`, "error");
  },
});

crearIndicadores(store, {
  onReconectarWs: () => ws.reconectarAhora(),
  onComprobarApi: () => salud.comprobar(),
});
crearBotones(store, coordinador);
crearPanelDemo(store, controlDemo);
crearVistaMonitoreo(store);

// ----- Joysticks (tracción a la izquierda, brazo y pala a la derecha) -----
// Solo hay un movimiento a la vez: el último que se pide gana. Al soltar un joystick
// solo se manda DETENER si ese joystick era el dueño de la orden vigente.
function montarJoystick({ id, base, lectura, mapa, teclas }) {
  const estado = $(lectura);
  const joystick = crearJoystick($(base), {
    teclas,
    onDireccion: (direccion) => {
      store.set({ activo: id });
      coordinador.solicitarPorNombre(mapa[direccion], "joystick");
    },
    onDetener: () => {
      if (store.get().activo !== id) return;
      store.set({ activo: null });
      coordinador.detener("joystick");
    },
    onCambioVisual: (direccion) => {
      estado.textContent = direccion ? nombreLegible(mapa[direccion]) : "En el centro";
      estado.dataset.activo = direccion ? "si" : "";
    },
  });

  function etiquetar(catalogo) {
    const disponibles = [];
    for (const [direccion, nombre] of Object.entries(mapa)) {
      const marca = $(`${base} .joy-marca[data-dir="${direccion}"]`);
      const comando = catalogo.find((c) => c.nombre === nombre);
      marca.title = comando ? `${nombreLegible(comando.nombre)} (código ${comando.codigo})` : "Sin comando en el catálogo";
      marca.classList.toggle("ausente", !comando);
      if (comando) disponibles.push(direccion);
    }
    return disponibles;
  }
  return { id, joystick, etiquetar };
}

const joysticks = [
  montarJoystick({ id: "traccion", base: "#joystick", lectura: "#joy-estado", mapa: CONFIG.JOYSTICK, teclas: TECLAS_TRACCION }),
  montarJoystick({ id: "brazo", base: "#joystick-brazo", lectura: "#joy-estado-brazo", mapa: CONFIG.JOYSTICK_BRAZO, teclas: TECLAS_BRAZO }),
];

let firmaJoysticks = "";
store.subscribe((s) => {
  const firma = s.catalogo.map((c) => c.nombre).join("|");
  const cambio = firma !== firmaJoysticks;
  firmaJoysticks = firma;
  for (const { id, joystick, etiquetar } of joysticks) {
    const libre = s.activo === null || s.activo === id;
    joystick.configurar({ habilitar: s.catalogoListo && !s.demoActiva && libre, disponibles: cambio ? etiquetar(s.catalogo) : undefined });
  }
  $("#joy-bloqueo").hidden = !s.demoActiva;
});

// ----- DETENER: prioridad absoluta (botón grande, botón flotante y tecla Escape) -----
let ultimoDetener = 0;
function pedirDetener(fuente) {
  const ahora = Date.now();
  if (ahora - ultimoDetener < 250) return; // doble toque accidental
  ultimoDetener = ahora;
  const principal = $("#btn-detener");
  principal.classList.add("pulsado");
  setTimeout(() => principal.classList.remove("pulsado"), 300);
  if (store.get().activo !== null) store.set({ activo: null });
  coordinador.detener(fuente);
}
$("#btn-detener").addEventListener("click", () => pedirDetener("detener"));
for (const boton of document.querySelectorAll("[data-detener]")) boton.addEventListener("click", () => pedirDetener("detener"));
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && !evento.repeat && !evento.target.closest?.("input")) pedirDetener("teclado");
});

// ----- Navegación inferior: Control / Monitoreo / Registro -----
function mostrarVista(nombre) {
  document.body.dataset.vista = nombre;
  for (const vista of document.querySelectorAll(".vista")) vista.hidden = vista.id !== `vista-${nombre}`;
  for (const item of document.querySelectorAll(".nav-item[data-ir]")) {
    if (item.dataset.ir === nombre) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  window.scrollTo({ top: 0 });
}
for (const item of document.querySelectorAll(".nav-item[data-ir]")) {
  item.addEventListener("click", () => mostrarVista(item.dataset.ir));
}

// ----- Estado grande y última acción -----
const ultimaAccion = $("#ultima-accion");
const estadoGrande = $("#estado-grande");
const ETAPAS = { en_cola: "en cola", solicitado: "solicitado", aceptado: "aceptado por API",
  superado: "superado por DETENER", descartado: "descartado", error: "error" };
// Comandos de función: no mueven el carrito, así que no cambian la palabra grande de estado
const COMANDOS_FUNCION = new Set(["ENCENDER_APAGAR", "SONIDO", "LUZ"]);

// Chip de energía junto al estado (sigue al botón encender / apagar)
const chipEnergia = $("#chip-energia");
store.subscribe((s) => {
  const estado = s.encendido ? "on" : "off";
  if (chipEnergia.dataset.estado === estado) return;
  chipEnergia.dataset.estado = estado;
  chipEnergia.querySelector("span").textContent = s.encendido ? "Encendido" : "Apagado";
});

let temporizadorEstado = null;
function pintarEstado() {
  clearTimeout(temporizadorEstado);
  const s = store.get();
  const r = s.acciones[0];

  // Línea de detalle
  if (!r) {
    ultimaAccion.textContent = "Sin acciones todavía";
    ultimaAccion.dataset.fase = "";
  } else {
    const ws = r.ws ? ", evento WS" : "";
    ultimaAccion.textContent = `${nombreLegible(r.nombre)} (${r.codigo}): ${ETAPAS[r.fase]}${ws}`;
    ultimaAccion.dataset.fase = r.ws ? "evento" : r.fase;
  }

  // Palabra grande: el vehículo se mueve unos segundos por orden y luego se detiene solo
  let texto = "Detenido";
  let tono = "detenido";
  const edad = r ? Date.now() - new Date(r.hora).getTime() : Infinity;
  if (s.demoActiva) {
    texto = "DEMO en curso";
    tono = "demo";
  } else if (r && r.fase === "error") {
    texto = "Error";
    tono = "error";
  } else if (r && r.nombre !== CONFIG.COMANDO_DETENER && !COMANDOS_FUNCION.has(r.nombre)
             && ["solicitado", "aceptado", "en_cola"].includes(r.fase)
             && edad < CONFIG.MOVIMIENTO_VISUAL_MS) {
    texto = nombreLegible(r.nombre);
    tono = "mueve";
    temporizadorEstado = setTimeout(pintarEstado, CONFIG.MOVIMIENTO_VISUAL_MS - edad + 20);
  }
  if (estadoGrande.textContent !== texto) estadoGrande.textContent = texto;
  estadoGrande.dataset.tono = tono;
}
store.subscribe(pintarEstado);

// ----- Carga inicial de datos -----
async function cargarDatos() {
  const reintentar = $("#btn-reintentar");
  const estadoCarga = $("#estado-carga");
  reintentar.hidden = true;
  estadoCarga.textContent = "Cargando vehículo, comandos y DEMO…";
  estadoCarga.hidden = false;

  const [vehiculo, comandos, demos] = await Promise.allSettled([
    servicios.vehiculo(),
    servicios.comandos(),
    servicios.demos(),
  ]);

  if (vehiculo.status === "fulfilled") {
    const v = vehiculo.value;
    store.set({ vehiculo: v });
    $("#vehiculo-nombre").textContent = v.nombre;
    $("#vehiculo-detalle").textContent = [`ID ${v.id_vehiculo}`, v.microcontrolador].filter(Boolean).join(", ");
  } else {
    $("#vehiculo-nombre").textContent = `Vehículo ${CONFIG.VEHICLE_ID}`;
  }

  if (demos.status === "fulfilled") {
    store.set({ demos: demos.value.filter((d) => d.activo !== false) });
  }

  if (comandos.status === "fulfilled") {
    store.set({ catalogo: comandos.value.filter((c) => c.activo !== false), catalogoListo: true });
    estadoCarga.hidden = true;
    controlDemo.sincronizar();
    // MONITOREO: carga inicial por REST del último estado y de los diez movimientos
    monitor.sincronizar({ motivo: "carga" });
  } else {
    estadoCarga.textContent = `No se pudo cargar el catálogo: ${mensajeDeError(comandos.reason)}`;
    reintentar.hidden = false;
  }
}

$("#btn-reintentar").addEventListener("click", cargarDatos);

// ----- Arranque -----
salud.iniciar();
ws.conectar();
cargarDatos();
