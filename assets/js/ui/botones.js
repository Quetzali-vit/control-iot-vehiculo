// Botones del control para los comandos del catálogo que no maneja ningún joystick.
// Todos llaman al mismo coordinador que los joysticks.
import { CONFIG } from "../config.js";
import { $, crear, icono, nombreLegible } from "../utils/dom.js";

// Iconos; un comando desconocido usa uno genérico
const ICONOS = {
  ENCENDER_APAGAR: "bi-power",
  SONIDO: "bi-volume-up-fill",
  LUZ: "bi-lightbulb-fill",
  AVANZAR_GIRO_IZQUIERDA: "bi-arrow-up-left-circle-fill",
  RETROCEDER_GIRO_IZQ_PALA: "bi-arrow-down-left-circle-fill",
  AVANZAR_GIRO_IZQ_PALA: "bi-arrow-up-left-square-fill",
  SUBIR_BRAZO: "bi-chevron-double-up",
  BAJAR_BRAZO: "bi-chevron-double-down",
  ABRIR_PALA: "bi-arrows-angle-expand",
  CERRAR_PALA: "bi-arrows-angle-contract",
};

// Textos más cortos para el botón (el nombre real sigue en el título y en el registro)
const ETIQUETAS = {
  ENCENDER_APAGAR: "Encender / apagar",
  AVANZAR_GIRO_IZQUIERDA: "Avanzar + giro izq.",
  RETROCEDER_GIRO_IZQ_PALA: "Retroceder + giro izq. + pala",
  AVANZAR_GIRO_IZQ_PALA: "Avanzar + giro izq. + pala",
};

// Color de cada tecla (el resto usa el violeta por defecto)
const TONOS = { ENCENDER_APAGAR: "verde", SONIDO: "cian", LUZ: "ambar" };

// Funciones del control primero; después el resto por código
const PRIORIDAD = ["ENCENDER_APAGAR", "SONIDO", "LUZ"];

const NOMBRE_POTENCIA = "ENCENDER_APAGAR";

const NOMBRES_JOYSTICK = new Set([
  ...Object.values(CONFIG.JOYSTICK),
  ...Object.values(CONFIG.JOYSTICK_BRAZO),
  CONFIG.COMANDO_DETENER,
  ...CONFIG.COMANDOS_OCULTOS,
]);

export function crearBotones(store, coordinador) {
  const contenedor = $("#botones");
  const vacio = $("#botones-vacio");
  let firma = "";
  let temporizadorLiberar = null;

  // Animación al aceptar el comando: onda verde al encender, onda roja al apagar, pulso para el resto
  function reiniciarAnimacion(boton, clase) {
    boton.classList.remove("anim-on", "anim-off", "anim-sonido");
    void boton.offsetWidth; // reinicia la animación aunque se repita
    boton.classList.add(clase);
    setTimeout(() => boton.classList.remove(clase), 900);
  }

  function animar(boton, comando) {
    if (comando.nombre === NOMBRE_POTENCIA) {
      const encendido = !store.get().encendido;
      store.set({ encendido });
      reiniciarAnimacion(boton, encendido ? "anim-on" : "anim-off");
    } else {
      reiniciarAnimacion(boton, "anim-sonido");
    }
  }

  async function pulsar(boton, comando) {
    if (boton.dataset.fase === "enviando") return;
    boton.dataset.fase = "enviando";
    boton.setAttribute("aria-busy", "true");
    // Mientras este botón actúa, todo lo demás se bloquea (hasta que termine o se pulse DETENER)
    const dueno = `boton:${comando.codigo}`;
    store.set({ activo: dueno });
    clearTimeout(temporizadorLiberar);
    temporizadorLiberar = setTimeout(() => {
      if (store.get().activo === dueno) store.set({ activo: null });
    }, CONFIG.MOVIMIENTO_VISUAL_MS);
    const resultado = await coordinador.solicitar(comando, "boton");
    boton.removeAttribute("aria-busy");
    if (resultado.ok) animar(boton, comando);
    if (!resultado.ok && store.get().activo === dueno) {
      clearTimeout(temporizadorLiberar);
      store.set({ activo: null });
    }
    const fase = resultado.ok ? "aceptado" : (resultado.motivo === "error" ? "error" : "");
    boton.dataset.fase = fase;
    if (fase) {
      setTimeout(() => {
        if (boton.dataset.fase === fase) boton.dataset.fase = "";
      }, 1400);
    }
  }

  function crearBoton(comando) {
    const boton = crear("button", { clase: "boton-comando boton-redondo", atributos: { type: "button" } }, [
      crear("span", { clase: "redondo-codigo", texto: String(comando.codigo), atributos: { "aria-hidden": "true" } }),
      crear("span", { clase: "redondo-cuerpo" }, [icono(ICONOS[comando.nombre] ?? "bi-record-circle")]),
      crear("span", { clase: "redondo-texto visually-hidden", texto: ETIQUETAS[comando.nombre] ?? nombreLegible(comando.nombre) }),
    ]);
    boton.dataset.codigo = String(comando.codigo);
    boton.dataset.tono = TONOS[comando.nombre] ?? "violeta";
    if (comando.nombre === NOMBRE_POTENCIA) boton.dataset.potencia = store.get().encendido ? "on" : "off";
    const nombre = ETIQUETAS[comando.nombre] ?? nombreLegible(comando.nombre);
    boton.title = `${nombre} (código ${comando.codigo})`;
    let ultimoToque = 0;
    boton.addEventListener("click", () => {
      const ahora = Date.now();
      if (ahora - ultimoToque < CONFIG.BOTON_ENFRIAMIENTO_MS) return; // evita ráfagas
      ultimoToque = ahora;
      pulsar(boton, comando);
    });
    return boton;
  }

  function construir(catalogo) {
    const resto = catalogo
      .filter((c) => !NOMBRES_JOYSTICK.has(c.nombre))
      .sort((a, b) => {
        const pa = PRIORIDAD.indexOf(a.nombre);
        const pb = PRIORIDAD.indexOf(b.nombre);
        if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
        return a.codigo - b.codigo;
      });
    contenedor.replaceChildren(...resto.map(crearBoton));
    vacio.hidden = resto.length > 0;
  }

  function render(s) {
    const nueva = s.catalogo.map((c) => `${c.id_comando}:${c.codigo}:${c.nombre}`).join("|");
    if (nueva !== firma) {
      firma = nueva;
      construir(s.catalogo);
    }
    const base = !s.catalogoListo || Boolean(s.demoActiva);
    for (const boton of document.querySelectorAll("#botones .boton-comando")) {
      const esDueno = s.activo === `boton:${boton.dataset.codigo}`;
      boton.disabled = base || (s.activo !== null && !esDueno);
      boton.dataset.activo = esDueno ? "si" : "";
      if (boton.dataset.potencia !== undefined) {
        boton.dataset.potencia = s.encendido ? "on" : "off";
        boton.setAttribute("aria-pressed", String(s.encendido));
        boton.title = `Encender / apagar (${s.encendido ? "encendido" : "apagado"}, código ${boton.dataset.codigo})`;
      }
    }
  }

  store.subscribe(render);
  render(store.get());
}
