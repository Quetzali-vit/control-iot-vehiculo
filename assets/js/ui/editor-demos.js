// Editor de DEMO (4.3).
//
// Trabaja sobre la unidad seleccionada. Muestra las demos de fábrica y las
// propias (la API nunca devuelve las privadas de otra persona). Se edita un
// BORRADOR local: agregar, quitar, reordenar y cambiar comando, duración y
// pausa; «Guardar» lo persiste en Amazon RDS a través de la API y «Cancelar»
// lo descarta. El servidor vuelve a validar todo (dueño, comandos de ESA unidad
// y límites), así que el editor solo evita errores obvios.
import { CONFIG } from "../config.js";
import { vehiculoActual } from "../estado/contexto.js";
import { sesion } from "../estado/sesion.js";
import { crear, icono, nombreLegible } from "../utils/dom.js";
import { mensajeDeError } from "../utils/errores.js";

/** ¿Puede esta sesión modificar esa demo? (el servidor lo vuelve a decidir)
 *  Admin: cualquier demo de los carritos que gestiona (fábrica o del cliente).
 *  Comprador: solo sus demos privadas. Invitado: ninguna. */
function editable(demo) {
  if (!demo || sesion.esInvitado()) return false;
  return sesion.esAdmin() ? true : demo.tipo === "PRIVADA";
}

export function crearEditorDemos({ contenedor, servicios, store, controlDemo, avisar, alCambiar }) {
  let demos = [];
  let comandos = [];
  let seleccion = null;      // demo abierta
  let originales = [];       // pasos guardados en RDS
  let borrador = [];         // pasos en edición: {id_comando, duracion_ms, pausa_ms}
  let cargando = false;
  let unidadCargada = null;

  const raiz = crear("div", { clase: "editor" });
  contenedor.replaceChildren(raiz);

  // =================================================================
  async function refrescar() {
    const id = vehiculoActual();
    cargando = true;
    pintar();
    try {
      [demos, comandos] = await Promise.all([servicios.demos(id), servicios.comandos(id)]);
      comandos = comandos.filter((c) => c.activo !== false);
      unidadCargada = id;
      if (seleccion) {
        const sigue = demos.find((d) => d.id_demo === seleccion.id_demo);
        if (sigue) await abrir(sigue, { silencioso: true });
        else cerrar();
      }
    } catch (error) {
      demos = [];
      avisar(`Demos: ${mensajeDeError(error)}`, "error");
    } finally {
      cargando = false;
      pintar();
    }
  }

  async function abrir(demo, { silencioso = false } = {}) {
    seleccion = demo;
    try {
      originales = await servicios.pasosDemo(unidadCargada, demo.id_demo);
      borrador = originales.map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms }));
    } catch (error) {
      originales = [];
      borrador = [];
      if (!silencioso) avisar(`No se pudieron leer los pasos: ${mensajeDeError(error)}`, "error");
    }
    pintar();
  }

  function cerrar() {
    seleccion = null;
    originales = [];
    borrador = [];
    pintar();
  }

  const cambiado = () => JSON.stringify(borrador) !== JSON.stringify(
    originales.map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms })));

  // =================================================================
  async function crearDemo(nombre, descripcion) {
    try {
      const { id_demo } = await servicios.crearDemo(vehiculoActual(), nombre, descripcion);
      avisar(`DEMO «${nombre}» creada. Agrega sus pasos.`, "ok");
      await refrescar();
      const nueva = demos.find((d) => d.id_demo === id_demo);
      if (nueva) await abrir(nueva);
      alCambiar?.();
    } catch (error) {
      avisar(`Crear DEMO: ${mensajeDeError(error)}`, "error");
    }
  }

  async function guardar() {
    if (!seleccion) return;
    const problema = validar();
    if (problema) {
      avisar(problema, "aviso");
      return;
    }
    const id = unidadCargada;
    const idDemo = seleccion.id_demo;
    try {
      // Se reemplaza la secuencia completa: primero se quitan los pasos guardados
      // y luego se insertan los del borrador en orden 1..N.
      for (const paso of originales) await servicios.eliminarPaso(id, idDemo, paso.id_demo_movimiento);
      for (const [i, paso] of borrador.entries()) {
        await servicios.agregarPaso(id, idDemo, { ...paso, orden: i + 1 });
      }
      avisar(`DEMO «${seleccion.nombre}» guardada en Amazon RDS (${borrador.length} pasos).`, "ok");
      await refrescar(); // vuelve a leer la lista (con su conteo de pasos) y reabre la demo
      alCambiar?.();
    } catch (error) {
      avisar(`Guardar DEMO: ${mensajeDeError(error)}. Se recargó lo que quedó guardado.`, "error");
      await abrir(seleccion, { silencioso: true });
    }
  }

  async function eliminarDemo() {
    if (!seleccion) return;
    if (!window.confirm(`¿Eliminar la DEMO «${seleccion.nombre}» y sus pasos? No se puede deshacer.`)) return;
    try {
      await servicios.eliminarDemo(unidadCargada, seleccion.id_demo);
      avisar(`DEMO «${seleccion.nombre}» eliminada.`, "ok");
      cerrar();
      await refrescar();
      alCambiar?.();
    } catch (error) {
      avisar(`Eliminar DEMO: ${mensajeDeError(error)}`, "error");
    }
  }

  function validar() {
    if (borrador.length === 0) return "Agrega al menos un paso antes de guardar.";
    if (borrador.length > CONFIG.DEMO_MAX_PASOS) return `Una DEMO admite hasta ${CONFIG.DEMO_MAX_PASOS} pasos.`;
    for (const [i, p] of borrador.entries()) {
      if (!comandos.some((c) => c.id_comando === p.id_comando)) return `Paso ${i + 1}: elige un comando de esta unidad.`;
      if (!(p.duracion_ms >= CONFIG.DEMO_PASO_MIN_MS && p.duracion_ms <= CONFIG.DEMO_PASO_MAX_MS)) {
        return `Paso ${i + 1}: la duración debe estar entre ${CONFIG.DEMO_PASO_MIN_MS} y ${CONFIG.DEMO_PASO_MAX_MS} ms.`;
      }
      if (!(p.pausa_ms >= 0 && p.pausa_ms <= CONFIG.DEMO_PAUSA_MAX_MS)) {
        return `Paso ${i + 1}: la pausa debe estar entre 0 y ${CONFIG.DEMO_PAUSA_MAX_MS} ms.`;
      }
    }
    return "";
  }

  // =================================================================
  // Vista
  // =================================================================
  function pintar() {
    const partes = [];

    // ----- Encabezado y creación -----
    const titulo = crear("div", { clase: "editor-cabeza" }, [
      crear("h3", { texto: "Demos de la unidad" }),
      crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-arrow-clockwise"), crear("span", { texto: "Actualizar" })]),
    ]);
    titulo.querySelector("button").addEventListener("click", refrescar);
    partes.push(titulo);

    if (!sesion.esInvitado()) {
      const nombre = crear("input", { clase: "form-control", atributos: { placeholder: "Nombre de la nueva demo", maxlength: "80", "aria-label": "Nombre de la nueva demo" } });
      const desc = crear("input", { clase: "form-control", atributos: { placeholder: "Descripción (opcional)", maxlength: "255", "aria-label": "Descripción" } });
      const crearBtn = crear("button", { clase: "btn-prim", atributos: { type: "submit" } }, [icono("bi-plus-lg"), crear("span", { texto: "Nueva demo" })]);
      const form = crear("form", { clase: "editor-nueva" }, [nombre, desc, crearBtn]);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nombre.value.trim()) {
          nombre.focus();
          return;
        }
        crearDemo(nombre.value.trim(), desc.value.trim());
      });
      partes.push(form);
      partes.push(crear("p", { clase: "nota-suave", texto: sesion.esAdmin()
        ? "En un carrito libre la demo es de fábrica (la ven todos); en uno vendido es privada del cliente."
        : "Las demos que crees son privadas: solo tú las ves y las editas. Las de fábrica puedes ejecutarlas, no modificarlas." }));
    }

    // ----- Lista de demos -----
    if (cargando && demos.length === 0) {
      partes.push(crear("p", { clase: "vacio", texto: "Cargando demos…" }));
    } else if (demos.length === 0) {
      partes.push(crear("p", { clase: "vacio", texto: "Esta unidad todavía no tiene demos." }));
    } else {
      const lista = crear("ul", { clase: "demo-lista" }, demos.map((d) => {
        const boton = crear("button", { clase: "demo-item", atributos: { type: "button", "aria-pressed": String(seleccion?.id_demo === d.id_demo) } }, [
          crear("span", { clase: "demo-item-nombre", texto: d.nombre }),
          crear("span", { clase: `insignia insignia-${(d.tipo || "FABRICA").toLowerCase()}`, texto: d.tipo === "PRIVADA" ? "Privada" : "Fábrica" }),
          crear("span", { clase: "demo-item-pasos", texto: `${d.total_movimientos ?? "?"} pasos` }),
        ]);
        boton.addEventListener("click", () => abrir(d));
        return crear("li", {}, [boton]);
      }));
      partes.push(lista);
    }

    // ----- Demo abierta -----
    if (seleccion) partes.push(pintarSeleccion());

    raiz.replaceChildren(...partes);
  }

  function pintarSeleccion() {
    const puede = editable(seleccion);
    const total = borrador.reduce((s, p) => s + (Number(p.duracion_ms) || 0) + (Number(p.pausa_ms) || 0), 0);

    const filas = borrador.map((p, i) => {
      const comando = crear("select", { clase: "form-select", atributos: { "aria-label": `Comando del paso ${i + 1}` } },
        comandos.map((c) => crear("option", { texto: `${nombreLegible(c.nombre)} (${c.codigo})`, atributos: { value: String(c.id_comando) } })));
      comando.value = String(p.id_comando);
      comando.disabled = !puede;
      comando.addEventListener("change", () => { p.id_comando = Number(comando.value); pintar(); });

      const dur = numero(p.duracion_ms, CONFIG.DEMO_PASO_MIN_MS, CONFIG.DEMO_PASO_MAX_MS, `Duración del paso ${i + 1} en ms`, !puede,
        (v) => { p.duracion_ms = v; pintar(); });
      const pausa = numero(p.pausa_ms, 0, CONFIG.DEMO_PAUSA_MAX_MS, `Pausa del paso ${i + 1} en ms`, !puede,
        (v) => { p.pausa_ms = v; pintar(); });

      const acciones = crear("div", { clase: "paso-acciones" }, [
        boton("bi-arrow-up", `Subir paso ${i + 1}`, i === 0 || !puede, () => mover(i, -1)),
        boton("bi-arrow-down", `Bajar paso ${i + 1}`, i === borrador.length - 1 || !puede, () => mover(i, 1)),
        boton("bi-x-lg", `Quitar paso ${i + 1}`, !puede, () => { borrador.splice(i, 1); pintar(); }, "peligro"),
      ]);
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(i + 1) }),
        crear("td", {}, [comando]),
        crear("td", {}, [dur]),
        crear("td", {}, [pausa]),
        crear("td", {}, [acciones]),
      ]);
    });

    const tabla = crear("div", { clase: "tabla-caja" }, [
      crear("table", { clase: "tabla" }, [
        crear("caption", { clase: "visually-hidden", texto: `Pasos de la demo ${seleccion.nombre}` }),
        crear("thead", {}, [crear("tr", {}, [
          crear("th", { texto: "#", atributos: { scope: "col" } }),
          crear("th", { texto: "Comando", atributos: { scope: "col" } }),
          crear("th", { texto: "Duración (ms)", atributos: { scope: "col" } }),
          crear("th", { texto: "Pausa (ms)", atributos: { scope: "col" } }),
          crear("th", { texto: "Orden", atributos: { scope: "col" } }),
        ])]),
        crear("tbody", {}, filas),
      ]),
      ...(borrador.length === 0 ? [crear("p", { clase: "vacio", texto: "Sin pasos todavía." })] : []),
    ]);

    const agregar = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-plus-lg"), crear("span", { texto: "Agregar paso" })]);
    agregar.disabled = !puede || borrador.length >= CONFIG.DEMO_MAX_PASOS || comandos.length === 0;
    agregar.addEventListener("click", () => {
      const base = comandos.find((c) => c.nombre === "AVANZAR") || comandos[0];
      borrador.push({ id_comando: base.id_comando, duracion_ms: 1000, pausa_ms: 200 });
      pintar();
    });

    const guardarBtn = crear("button", { clase: "btn-prim", atributos: { type: "button" } }, [icono("bi-cloud-check"), crear("span", { texto: "Guardar" })]);
    guardarBtn.disabled = !puede || !cambiado();
    guardarBtn.addEventListener("click", guardar);

    const cancelarBtn = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-arrow-counterclockwise"), crear("span", { texto: "Cancelar cambios" })]);
    cancelarBtn.disabled = !cambiado();
    cancelarBtn.addEventListener("click", () => abrir(seleccion));

    const ejecutar = crear("button", { clase: "btn-prim btn-ejecutar", atributos: { type: "button" } }, [icono("bi-play-fill"), crear("span", { texto: "Ejecutar en CONTROL" })]);
    ejecutar.disabled = cambiado() || borrador.length === 0 || Boolean(store.get().demoActiva) || sesion.esInvitado();
    ejecutar.addEventListener("click", () => controlDemo.iniciar(seleccion.id_demo));

    const eliminar = crear("button", { clase: "btn-sec peligro", atributos: { type: "button" } }, [icono("bi-trash"), crear("span", { texto: "Eliminar demo" })]);
    eliminar.hidden = !puede;
    eliminar.addEventListener("click", eliminarDemo);

    return crear("section", { clase: "editor-demo", atributos: { "aria-label": `Demo ${seleccion.nombre}` } }, [
      crear("div", { clase: "editor-demo-cabeza" }, [
        crear("h4", { texto: seleccion.nombre }),
        crear("span", { clase: `insignia insignia-${(seleccion.tipo || "FABRICA").toLowerCase()}`, texto: seleccion.tipo === "PRIVADA" ? "Privada" : "Fábrica" }),
      ]),
      ...(seleccion.descripcion ? [crear("p", { clase: "nota-suave", texto: seleccion.descripcion })] : []),
      ...(!puede ? [crear("p", { clase: "nota-suave", texto: "Es una demo de fábrica: puedes ejecutarla, pero no modificarla." })] : []),
      tabla,
      crear("p", { clase: "editor-total" }, [
        icono("bi-stopwatch"),
        crear("span", { texto: `Duración total: ${(total / 1000).toFixed(1)} s · ${borrador.length} paso(s)` }),
        ...(cambiado() ? [crear("strong", { clase: "sin-guardar", texto: " · Cambios sin guardar" })] : []),
      ]),
      crear("div", { clase: "editor-botones" }, [agregar, cancelarBtn, guardarBtn, ejecutar, eliminar]),
    ]);
  }

  function mover(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= borrador.length) return;
    [borrador[i], borrador[j]] = [borrador[j], borrador[i]];
    pintar();
  }

  function numero(valor, min, max, etiqueta, deshabilitado, alCambiar) {
    const entrada = crear("input", { clase: "form-control", atributos: {
      type: "number", inputmode: "numeric", min: String(min), max: String(max), step: "100", "aria-label": etiqueta,
    } });
    entrada.value = String(valor);
    entrada.disabled = deshabilitado;
    entrada.addEventListener("change", () => {
      const v = Number.parseInt(entrada.value, 10);
      alCambiar(Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min);
    });
    return entrada;
  }

  function boton(nombreIcono, etiqueta, deshabilitado, accion, extra = "") {
    const b = crear("button", { clase: `btn-icono ${extra}`, atributos: { type: "button", "aria-label": etiqueta, title: etiqueta } }, [icono(nombreIcono)]);
    b.disabled = deshabilitado;
    b.addEventListener("click", accion);
    return b;
  }

  return { refrescar, pintar };
}
