// Punto de entrada: decide qué ver según la sesión y conecta los módulos.
//
// 4.1 CONTROL · 4.2 MONITOREO · 4.3 ADMINISTRACIÓN, en un único sitio.
// Sin sesión se muestra el acceso (login o prueba de invitado). Con sesión se
// arma la plataforma según el rol que confirma la API (/auth/yo), nunca según
// lo que diga el navegador: el menú por rol es comodidad, la seguridad real son
// las respuestas 401/403/404 del servidor.
import { CONFIG } from "./config.js";
import { servicios } from "./api/servicios.js";
import { EVENTO_SESION_VENCIDA } from "./api/cliente-http.js";
import { crearStore, ESTADO_INICIAL } from "./estado/store.js";
import { sesion } from "./estado/sesion.js";
import { alCambiarVehiculo, fijarVehiculo, vehiculoActual } from "./estado/contexto.js";
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
import { mostrarAcceso } from "./ui/acceso.js";
import { crearCuenta } from "./ui/cuenta.js";
import { crearVistaAdmin } from "./ui/admin.js";
import { crearMisVehiculos } from "./ui/mis-vehiculos.js";
import { crearEditorDemos } from "./ui/editor-demos.js";
import { $, crear, nombreLegible } from "./utils/dom.js";
import { mensajeDeError } from "./utils/errores.js";

const LLAVE_MOTIVO = "control-iot:motivo";

// =====================================================================
// Cierre de sesión forzado (token vencido, revocado o prueba terminada)
// =====================================================================
function salirCon(motivo) {
  try {
    sessionStorage.setItem(LLAVE_MOTIVO, motivo);
  } catch {
    // sin almacenamiento el motivo no se muestra; no pasa nada
  }
  sesion.borrar();
  location.reload();
}

function motivoPendiente() {
  try {
    const motivo = sessionStorage.getItem(LLAVE_MOTIVO) || "";
    sessionStorage.removeItem(LLAVE_MOTIVO);
    return motivo;
  } catch {
    return "";
  }
}

// =====================================================================
// Arranque
// =====================================================================
async function arrancar() {
  if (!sesion.token()) {
    mostrarAcceso(motivoPendiente());
    return;
  }

  // La API confirma quién es; si el token ya no sirve, de vuelta al acceso
  let yo;
  try {
    yo = await servicios.yo();
  } catch (error) {
    if (error?.status === 401) {
      const eraInvitado = sesion.esInvitado();
      sesion.borrar();
      mostrarAcceso(eraInvitado ? "Tu prueba terminó. La unidad quedó libre." : "Tu sesión terminó. Vuelve a iniciar sesión.");
      return;
    }
    yo = null; // sin red: se arma la interfaz con lo guardado y los indicadores dirán qué falla
  }
  if (yo && !yo.invitado) sesion.actualizarUsuario({ nombre: yo.nombre, correo: yo.correo, rol: yo.rol });
  iniciarPlataforma(yo);
}

window.addEventListener(EVENTO_SESION_VENCIDA, () => {
  if (sesion.token()) {
    salirCon(sesion.esInvitado()
      ? "Tu prueba de exhibición terminó. La unidad se detuvo y quedó libre."
      : "Tu sesión terminó o fue revocada. Vuelve a iniciar sesión.");
  }
});

// =====================================================================
// Plataforma con sesión
// =====================================================================
function iniciarPlataforma(yo) {
  const rol = sesion.rol();
  $("#acceso").hidden = true;
  $("#app").hidden = false;
  $("#nav").hidden = false;
  for (const item of document.querySelectorAll(".nav-item[data-solo]")) item.hidden = item.dataset.solo !== rol;

  const store = crearStore({ ...ESTADO_INICIAL, soloMonitoreo: false });
  const { avisar } = crearMensajes(store);

  const deps = {
    servicios,
    store,
    obtenerClave: () => sesion.token(),
    // 401 → la sesión terminó; 403 → sí hay sesión, pero no hay permiso para eso
    pedirClave: (mensaje, prohibido = false) => {
      if (prohibido) avisar(mensaje, "error");
      else salirCon(mensaje || "Tu sesión terminó. Vuelve a iniciar sesión.");
    },
    avisar,
  };
  const coordinador = crearCoordinador(deps);
  const controlDemo = crearControlDemo(deps);
  const salud = crearMonitorSalud({ servicios, store });
  const monitor = crearMonitor({ servicios, store, avisar });

  const cuenta = crearCuenta({ avisar, alTerminarPrueba: (motivo) => salirCon(motivo) });

  // ----- WebSocket del navegador (uno solo, compartido por todas las vistas) -----
  const ws = crearClienteWs({
    onEstado: (estado, detalle = "") => {
      const anterior = store.get().ws;
      store.set({ ws: estado, wsDetalle: detalle });
      if (estado === "en_linea" && anterior !== "en_linea" && store.get().catalogoListo) {
        controlDemo.sincronizar();
        if (anterior === "desconectado" || anterior === "reconectando") monitor.onReconexionWs();
      }
    },
    onMensaje: (mensaje) => {
      if (mensaje.id_vehiculo !== undefined && mensaje.id_vehiculo !== vehiculoActual()) return;
      if (mensaje.evento !== "pong") store.set({ ultimoEvento: mensaje });
      coordinador.registrarEventoWs(mensaje);
      controlDemo.onEventoWs(mensaje);
      monitor.onEventoWs(mensaje);
      if (mensaje.evento === "error" && typeof mensaje.mensaje === "string") avisar(`WebSocket: ${mensaje.mensaje}`, "error");
    },
    onSinSesion: () => salirCon(sesion.esInvitado()
      ? "Tu prueba de exhibición terminó. La unidad se detuvo y quedó libre."
      : "Tu sesión terminó. Vuelve a iniciar sesión."),
  });

  crearIndicadores(store, {
    onReconectarWs: () => ws.reconectarAhora(),
    onComprobarApi: () => salud.comprobar(),
  });
  crearBotones(store, coordinador);
  crearPanelDemo(store, controlDemo);
  crearVistaMonitoreo(store);

  // ----- Joysticks -----
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

  // ----- DETENER: prioridad absoluta -----
  let ultimoDetener = 0;
  function pedirDetener(fuente) {
    const ahora = Date.now();
    if (ahora - ultimoDetener < 250) return;
    ultimoDetener = ahora;
    const principal = $("#btn-detener");
    principal.classList.add("pulsado");
    setTimeout(() => principal.classList.remove("pulsado"), 300);
    if (store.get().activo !== null) store.set({ activo: null });
    if (store.get().soloMonitoreo) {
      avisar("Esta unidad pertenece a un comprador: desde la empresa solo se monitorea.", "aviso");
      return;
    }
    coordinador.detener(fuente);
  }
  $("#btn-detener").addEventListener("click", () => pedirDetener("detener"));
  for (const boton of document.querySelectorAll("[data-detener]")) boton.addEventListener("click", () => pedirDetener("detener"));
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !evento.repeat && !evento.target.closest?.("input,select,textarea")) pedirDetener("teclado");
  });

  // ----- Editores de demos (uno por vista que lo usa) -----
  const editores = {};
  function editor(nombre, contenedor) {
    if (!editores[nombre]) {
      editores[nombre] = crearEditorDemos({
        contenedor, servicios, store, controlDemo, avisar,
        alCambiar: () => recargarDemos(),
      });
    }
    return editores[nombre];
  }

  // ----- Vistas de 4.3 -----
  let vistaAdmin = null;
  let misVehiculos = null;
  const cajaEditorMis = crear("div");

  if (rol === "ADMIN") {
    vistaAdmin = crearVistaAdmin({
      contenedor: $("#admin-contenedor"), servicios, avisar,
      editorEnPestana: (caja) => editor("admin", caja).refrescar(),
      alCambiarInventario: () => cargarOpcionesAdmin(),
      irAControl: (vista) => mostrarVista(vista),
    });
  }
  if (rol === "USUARIO") {
    misVehiculos = crearMisVehiculos({
      contenedor: $("#mis-contenedor"), servicios, avisar, cajaEditor: cajaEditorMis,
      irA: (vista) => mostrarVista(vista),
    });
  }

  // ----- Navegación -----
  function mostrarVista(nombre) {
    document.body.dataset.vista = nombre;
    for (const vista of document.querySelectorAll(".vista")) vista.hidden = vista.id !== `vista-${nombre}`;
    for (const item of document.querySelectorAll(".nav-item[data-ir]")) {
      if (item.dataset.ir === nombre) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    if (nombre === "admin") vistaAdmin?.abrir();
    if (nombre === "mis") {
      misVehiculos?.cargar().then((lista) => {
        if (lista.length) editor("mis", cajaEditorMis).refrescar();
      });
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
  const COMANDOS_FUNCION = new Set(["ENCENDER_APAGAR", "SONIDO", "LUZ"]);

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
    if (!r) {
      ultimaAccion.textContent = s.soloMonitoreo ? "Unidad vendida: desde la empresa solo se monitorea" : "Sin acciones todavía";
      ultimaAccion.dataset.fase = "";
    } else {
      const wsTxt = r.ws ? ", evento WS" : "";
      ultimaAccion.textContent = `${nombreLegible(r.nombre)} (${r.codigo}): ${ETAPAS[r.fase]}${wsTxt}`;
      ultimaAccion.dataset.fase = r.ws ? "evento" : r.fase;
    }
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

  // =====================================================================
  // Unidades disponibles según el rol
  // =====================================================================
  let unidadesAdmin = [];

  async function cargarOpcionesAdmin() {
    try {
      unidadesAdmin = (await servicios.unidades()).filter((u) => u.activo);
    } catch (error) {
      avisar(`Inventario: ${mensajeDeError(error)}`, "error");
      return;
    }
    cuenta.fijarOpciones(unidadesAdmin.map((u) => ({
      id_vehiculo: u.id_vehiculo,
      nombre: u.nombre,
      etiqueta: `${u.nombre} · ID ${u.id_vehiculo}${u.id_propietario ? " · vendida (solo monitoreo)" : u.estado_comercial === "EXHIBICION" ? " · exhibición" : ""}`,
    })));
    if (!unidadesAdmin.some((u) => u.id_vehiculo === vehiculoActual())) {
      const preferida = unidadesAdmin.find((u) => !u.id_propietario) || unidadesAdmin[0];
      if (preferida) fijarVehiculo(preferida.id_vehiculo);
    }
    marcarSoloMonitoreo();
  }

  function marcarSoloMonitoreo() {
    const u = unidadesAdmin.find((x) => x.id_vehiculo === vehiculoActual());
    const solo = rol === "ADMIN" && Boolean(u?.id_propietario);
    if (store.get().soloMonitoreo !== solo) store.set({ soloMonitoreo: solo });
    document.body.dataset.soloMonitoreo = solo ? "si" : "";
  }

  async function prepararUnidades() {
    if (rol === "INVITADO") {
      const idPrueba = yo?.id_vehiculo_invitado ?? sesion.get()?.prueba?.id_vehiculo;
      if (idPrueba) fijarVehiculo(idPrueba, { recordar: false });
      cuenta.mostrarFijo(`Unidad de exhibición · ID ${vehiculoActual()}`);
      cuenta.iniciarCuenta(yo?.segundos_restantes ?? 300);
      return true;
    }
    if (rol === "ADMIN") {
      await cargarOpcionesAdmin();
      return unidadesAdmin.length > 0;
    }
    // USUARIO
    let propias = [];
    try {
      propias = await servicios.misVehiculos();
    } catch (error) {
      avisar(`Mis vehículos: ${mensajeDeError(error)}`, "error");
    }
    cuenta.fijarOpciones(propias.map((u) => ({ id_vehiculo: u.id_vehiculo, nombre: u.nombre, etiqueta: `${u.nombre} · ${u.modelo || "sin modelo"}` })));
    if (propias.length === 0) return false;
    if (!propias.some((u) => u.id_vehiculo === vehiculoActual())) fijarVehiculo(propias[0].id_vehiculo);
    return true;
  }

  // =====================================================================
  // Datos del vehículo seleccionado
  // =====================================================================
  let cargaVigente = 0;

  async function cargarDatos() {
    const turno = ++cargaVigente;
    const reintentar = $("#btn-reintentar");
    const estadoCarga = $("#estado-carga");
    reintentar.hidden = true;
    estadoCarga.textContent = "Cargando vehículo, comandos y DEMO…";
    estadoCarga.hidden = false;

    const [vehiculo, comandos, demos] = await Promise.allSettled([
      servicios.vehiculo(), servicios.comandos(), servicios.demos(),
    ]);
    if (turno !== cargaVigente) return; // llegó tarde: ya se eligió otra unidad

    if (vehiculo.status === "fulfilled") {
      const v = vehiculo.value;
      store.set({ vehiculo: v });
      $("#vehiculo-nombre").textContent = v.nombre;
      $("#vehiculo-detalle").textContent = [`ID ${v.id_vehiculo}`, v.microcontrolador].filter(Boolean).join(", ");
    } else {
      $("#vehiculo-nombre").textContent = `Vehículo ${vehiculoActual()}`;
    }

    if (demos.status === "fulfilled") store.set({ demos: demos.value.filter((d) => d.activo !== false) });

    if (comandos.status === "fulfilled") {
      let catalogo = comandos.value.filter((c) => c.activo !== false);
      // Invitado: solo la lista corta que autorizó el servidor para su prueba
      const permitidos = sesion.get()?.prueba?.comandos_permitidos;
      if (rol === "INVITADO" && Array.isArray(permitidos)) catalogo = catalogo.filter((c) => permitidos.includes(c.nombre));
      store.set({ catalogo, catalogoListo: !store.get().soloMonitoreo });
      estadoCarga.hidden = !store.get().soloMonitoreo;
      if (store.get().soloMonitoreo) estadoCarga.textContent = "Vendida: solo monitoreo";
      if (catalogo.length === 0) {
        estadoCarga.hidden = false;
        estadoCarga.textContent = "Esta unidad no tiene comandos configurados";
      }
      controlDemo.sincronizar();
      monitor.sincronizar({ motivo: "carga" });
    } else {
      estadoCarga.textContent = `No se pudo cargar el catálogo: ${mensajeDeError(comandos.reason)}`;
      reintentar.hidden = false;
      monitor.sincronizar({ motivo: "carga" });
    }
  }

  async function recargarDemos() {
    try {
      store.set({ demos: (await servicios.demos()).filter((d) => d.activo !== false) });
    } catch {
      // se queda la lista anterior
    }
  }

  $("#btn-reintentar").addEventListener("click", cargarDatos);

  // ----- Cambio de unidad: se cancela todo lo de la anterior -----
  alCambiarVehiculo(() => {
    store.set({
      vehiculo: null, catalogo: [], catalogoListo: false, demos: [], demoActiva: null,
      activo: null, acciones: [], ultimoEvento: null, encendido: false, sonido: true,
    });
    marcarSoloMonitoreo();
    monitor.reiniciar();
    ws.reabrir();
    cargarDatos();
    for (const e of Object.values(editores)) e.refrescar();
  });

  // =====================================================================
  salud.iniciar();
  prepararUnidades().then((hay) => {
    if (!hay) {
      store.set({ catalogoListo: false });
      $("#estado-carga").textContent = rol === "USUARIO" ? "Aún no tienes unidades asignadas" : "No hay unidades registradas";
      $("#vehiculo-nombre").textContent = rol === "USUARIO" ? "Sin unidades" : "Sin inventario";
      if (rol === "USUARIO") mostrarVista("mis");
      if (rol === "ADMIN") mostrarVista("admin");
      return;
    }
    ws.conectar();
    cargarDatos();
    if (rol === "ADMIN") mostrarVista("admin");
  });
}

arrancar();
