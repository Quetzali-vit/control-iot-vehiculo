// Vista ADMINISTRACIÓN (4.3, solo rol ADMIN).
//
// Todo dato viene de la API respaldada por Amazon RDS; si algo no se pudo leer
// se dice «Sin datos», nunca se simula. Ocultar esta vista a otros roles es solo
// comodidad: la seguridad real es que la API responde 403 a quien no es ADMIN.
//
// Reglas de negocio que muestra esta vista (y que el servidor vuelve a aplicar):
// - Un carrito («unidad») se da de baja con activo: false; nunca se borra.
// - Movimientos y demos de un MODELO se aplican a todas sus unidades.
// - El Administrador gestiona las demos de cualquier carrito, pero no mueve un
//   carrito vendido sin el soporte autorizado por el cliente.
import { fijarVehiculo, vehiculoActual } from "../estado/contexto.js";
import { sesion } from "../estado/sesion.js";
import { crear, icono, nombreLegible } from "../utils/dom.js";
import { aFecha, fechaCorta, horaLocal } from "../utils/fechas.js";
import { mensajeDeError } from "../utils/errores.js";

const ESTADOS = ["DISPONIBLE", "VENDIDO", "EXHIBICION", "INACTIVO"];
const ESTADO_TEXTO = { DISPONIBLE: "Disponible", VENDIDO: "Vendida / asignada", EXHIBICION: "Exhibición", INACTIVO: "Inactiva" };

export function crearVistaAdmin({ contenedor, servicios, avisar, editorEnPestana, alCambiarInventario, irAControl }) {
  let pestana = "dashboard";
  let datos = {
    metricas: null, unidades: [], modelos: [], usuarios: [], auditoria: [],
    sesiones: null, cuenta: null, comandosModelo: null,
  };
  let errores = {};
  let editando = null;        // id_vehiculo del carrito que se edita
  let cuentaId = null;        // id_usuario de la cuenta de cliente abierta
  let modeloId = null;        // id_modelo cuyos movimientos y demo de fábrica se gestionan
  let borradorDemo = [];      // pasos de la demo de fábrica en construcción
  let nombreDemoB = "";
  let descDemoB = "";

  const pestanas = [
    ["dashboard", "bi-speedometer2", "Dashboard"],
    ["unidades", "bi-truck-front", "Carritos"],
    ["modelos", "bi-box-seam", "Modelos"],
    ["clientes", "bi-people", "Clientes"],
    ["demos", "bi-collection-play", "Demos"],
    ["auditoria", "bi-journal-check", "Auditoría"],
  ];

  const barra = crear("div", { clase: "admin-tabs", atributos: { role: "tablist", "aria-label": "Secciones de administración" } },
    pestanas.map(([clave, ico, texto]) => {
      const b = crear("button", { clase: "admin-tab", atributos: { type: "button", role: "tab", "data-pestana": clave } }, [icono(ico), crear("span", { texto })]);
      b.addEventListener("click", () => ir(clave));
      return b;
    }));
  const cuerpo = crear("div", { clase: "admin-cuerpo" });
  const cajaEditor = crear("div", { clase: "admin-editor" });
  contenedor.replaceChildren(barra, cuerpo);

  // Ventana emergente para editar un carrito, la cuenta de un cliente o los
  // movimientos de un modelo: así no hay que bajar a buscar lo que se abrió.
  const dialogo = crear("dialog", { clase: "ventana-admin", atributos: { "aria-label": "Detalle" } });
  document.body.append(dialogo);
  dialogo.addEventListener("close", () => { editando = null; cuentaId = null; modeloId = null; });
  dialogo.addEventListener("click", (e) => { if (e.target === dialogo) dialogo.close(); });

  // =================================================================
  async function cargar(...cuales) {
    const tareas = {
      metricas: () => servicios.metricas(),
      unidades: () => servicios.unidades(),
      modelos: () => servicios.modelos(),
      usuarios: () => servicios.usuarios(),
      auditoria: () => servicios.auditoria(60),
      sesiones: () => servicios.sesiones(),
      cuenta: () => servicios.cuentaCliente(cuentaId),
      comandosModelo: () => servicios.comandosModelo(modeloId),
    };
    await Promise.all(cuales.map(async (clave) => {
      try {
        datos[clave] = await tareas[clave]();
        delete errores[clave];
      } catch (error) {
        errores[clave] = mensajeDeError(error);
      }
    }));
    pintar();
  }

  function ir(clave) {
    pestana = clave;
    for (const b of barra.querySelectorAll(".admin-tab")) {
      b.setAttribute("aria-selected", String(b.dataset.pestana === clave));
    }
    pintar();
    const necesita = {
      dashboard: ["metricas", "unidades", "auditoria"],
      unidades: ["unidades", "modelos", "usuarios"],
      modelos: ["modelos"],
      clientes: ["usuarios", "unidades", "sesiones"],
      demos: ["unidades"],
      auditoria: ["auditoria"],
    }[clave];
    cargar(...necesita);
  }

  function pintar() {
    const vistas = { dashboard, unidades, modelos, clientes, demos, auditoria };
    cuerpo.replaceChildren(vistas[pestana]());
    pintarVentana();
  }

  function pintarVentana() {
    let contenido = null;
    if (pestana === "unidades" && editando != null) {
      const u = datos.unidades.find((x) => x.id_vehiculo === editando);
      if (u) contenido = formularioEditarUnidad(u);
    } else if (pestana === "modelos" && modeloId != null) {
      contenido = panelModelo();
    } else if (pestana === "clientes" && cuentaId != null) {
      contenido = panelCuenta();
    }
    if (!contenido) {
      if (dialogo.open) dialogo.close();
      dialogo.replaceChildren();
      return;
    }
    const scroll = dialogo.scrollTop;
    dialogo.replaceChildren(contenido);
    if (!dialogo.open) dialogo.showModal();
    else dialogo.scrollTop = scroll;
  }

  // =================================================================
  // Dashboard
  // =================================================================
  function dashboard() {
    const m = datos.metricas;
    const tile = (ico, valor, texto, tono = "") => crear("div", { clase: `tile ${tono}` }, [
      icono(ico), crear("strong", { texto: m ? String(valor ?? 0) : "—" }), crear("span", { texto }),
    ]);
    const tiles = crear("div", { clase: "tiles" }, [
      tile("bi-box-seam", m?.modelos, "Modelos activos"),
      tile("bi-truck-front", m?.unidades, "Carritos"),
      tile("bi-bag-check", m?.vendidas, "Vendidos / asignados", "t-ok"),
      tile("bi-shop", m?.disponibles, "Disponibles"),
      tile("bi-easel", m?.exhibicion, "En exhibición", "t-ambar"),
      tile("bi-people", m?.clientes, "Clientes"),
      tile("bi-collection-play", m?.demos, `Demos (${m?.demos_fabrica ?? 0} de fábrica)`),
      tile("bi-person-badge", m?.pruebas_activas, "Pruebas de invitado activas", "t-cian"),
      tile("bi-broadcast", m?.conectadas, "Reportadas conectadas*"),
      tile("bi-clock-history", m?.movimientos_totales, "Movimientos en historial"),
    ]);
    const resumen = tablaUnidades(datos.unidades.slice(0, 6), { compacta: true });
    const ultimas = tablaAuditoria(datos.auditoria.slice(0, 8));
    return crear("div", { clase: "admin-seccion" }, [
      errores.metricas ? alerta(`Métricas: ${errores.metricas}`) : tiles,
      crear("p", { clase: "nota-suave", texto: "* «Conectadas» es el campo que reporta la base de datos; hasta integrar el ESP32 no confirma presencia física." }),
      crear("div", { clase: "dos-col" }, [
        bloque("Carritos recientes", resumen, () => ir("unidades")),
        bloque("Últimas acciones", ultimas, () => ir("auditoria")),
      ]),
    ]);
  }

  // =================================================================
  // Carritos (unidades físicas)
  // =================================================================
  function unidades() {
    const nombre = entrada("Nombre del carrito", { required: true, maxlength: 80, placeholder: "Retroexcavadora 002" });
    const modelo = selector("Modelo", [["", "Sin modelo"], ...datos.modelos.filter((x) => x.activo).map((x) => [x.id_modelo, x.nombre])]);
    const serie = entrada("Número de serie (único)", { maxlength: 40, placeholder: "UNI-0002" });
    const estado = selector("Estado comercial", ESTADOS.filter((e) => e !== "VENDIDO").map((e) => [e, ESTADO_TEXTO[e]]));
    const micro = entrada("Microcontrolador", { maxlength: 50, placeholder: "ESP32" });
    const copiar = selector("Copiar comandos de", [["", "No copiar"], ...datos.unidades.filter((u) => u.comandos > 0).map((u) => [u.id_vehiculo, `${u.nombre} (${u.comandos} comandos)`])]);

    const form = formulario("Registrar carrito", [nombre, modelo, serie, estado, micro, copiar], "Registrar carrito", async () => {
      const valores = {
        nombre: valor(nombre), id_modelo: numeroONulo(valor(modelo)), numero_serie: valor(serie) || null,
        estado_comercial: valor(estado), microcontrolador: valor(micro) || null,
      };
      const { id_vehiculo } = await servicios.crearUnidad(valores);
      const origen = numeroONulo(valor(copiar));
      if (origen) {
        const lista = await servicios.comandos(origen);
        for (const c of lista) {
          await servicios.crearComando(id_vehiculo, { nombre: c.nombre, codigo: c.codigo, descripcion: c.descripcion || null });
        }
      }
      avisar(`Carrito registrado con ID ${id_vehiculo}${origen ? " y comandos copiados" : ""}.`, "ok");
      alCambiarInventario?.();
      await cargar("unidades");
    });

    return crear("div", { clase: "admin-seccion" }, [
      form,
      errores.unidades ? alerta(errores.unidades) : bloque(`Carritos (${datos.unidades.length})`, tablaUnidades(datos.unidades)),
    ]);
  }

  function formularioEditarUnidad(u) {
    const nombre = entrada("Nombre del carrito", { required: true, maxlength: 80 });
    nombre.querySelector("input").value = u.nombre;
    const modelo = selector("Modelo", [["", "Sin modelo"], ...datos.modelos.map((x) => [x.id_modelo, x.nombre])]);
    modelo.querySelector("select").value = u.id_modelo ? String(u.id_modelo) : "";
    const serie = entrada("Número de serie", { maxlength: 40 });
    serie.querySelector("input").value = u.numero_serie || "";
    const micro = entrada("Microcontrolador", { maxlength: 50 });
    micro.querySelector("input").value = u.microcontrolador || "";

    const cerrar = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-x-lg"), crear("span", { texto: "Cerrar edición" })]);
    cerrar.addEventListener("click", () => { editando = null; pintar(); });

    const form = formulario(`Editar carrito ${u.id_vehiculo}`, [nombre, modelo, serie, micro], "Guardar cambios", async () => {
      await servicios.editarUnidad(u.id_vehiculo, {
        nombre: valor(nombre), id_modelo: numeroONulo(valor(modelo)),
        numero_serie: valor(serie) || null, microcontrolador: valor(micro) || null,
      });
      avisar(`Carrito ${u.id_vehiculo} actualizado.`, "ok");
      editando = null;
      await cargar("unidades");
    });
    form.open = true;
    return crear("div", { clase: "admin-seccion" }, [cerrar, form]);
  }

  function tablaUnidades(lista, { compacta = false } = {}) {
    if (lista.length === 0) return vacio("No hay carritos registrados.");
    const clientes = datos.usuarios.filter((u) => u.rol === "USUARIO" && u.activo);
    const filas = lista.map((u) => {
      const celdas = [
        crear("td", { clase: "mon-num", texto: String(u.id_vehiculo) }),
        crear("td", {}, [crear("strong", { texto: u.nombre }), crear("small", { clase: "d-block nota-suave", texto: u.modelo || "Sin modelo" })]),
        crear("td", { texto: u.numero_serie || "—" }),
        crear("td", {}, [crear("span", { clase: `estado-com e-${u.estado_comercial.toLowerCase()}`, texto: ESTADO_TEXTO[u.estado_comercial] || u.estado_comercial })]),
        crear("td", {}, [
          crear("span", { texto: u.propietario ? `${u.propietario}` : "—" }),
          ...(u.id_propietario ? [crear("small", { clase: `d-block soporte-chip ${u.soporte_segundos > 0 ? "si" : ""}`,
            texto: u.soporte_segundos > 0 ? `Soporte autorizado · ${Math.ceil(u.soporte_segundos / 60)} min` : "Sin soporte: solo monitoreo" })] : []),
        ]),
      ];
      if (!compacta) {
        // Activo = no es baja lógica. «Eliminar» en la práctica es desactivar.
        const activo = crear("input", { clase: "form-check-input", atributos: { type: "checkbox", "aria-label": `Carrito ${u.nombre} activo` } });
        activo.checked = Boolean(u.activo);
        activo.addEventListener("change", () => accion(async () => {
          await servicios.editarUnidad(u.id_vehiculo, { activo: activo.checked });
          avisar(`Carrito ${u.id_vehiculo} ${activo.checked ? "activado" : "dado de baja (conserva su historial)"}.`, "ok");
        }, ["unidades"], () => { activo.checked = Boolean(u.activo); }));

        // Cambiar estado comercial
        const est = crear("select", { clase: "form-select form-select-sm", atributos: { "aria-label": `Estado comercial de ${u.nombre}` } },
          ESTADOS.map((e) => crear("option", { texto: ESTADO_TEXTO[e], atributos: { value: e } })));
        est.value = u.estado_comercial;
        est.addEventListener("change", () => accion(async () => {
          await servicios.cambiarComercial(u.id_vehiculo, { estado_comercial: est.value });
          avisar(`Carrito ${u.id_vehiculo}: ${ESTADO_TEXTO[est.value]}.`, "ok");
        }, ["unidades"]));

        // Asignar a comprador
        const asig = crear("select", { clase: "form-select form-select-sm", atributos: { "aria-label": `Propietario de ${u.nombre}` } }, [
          crear("option", { texto: "Sin propietario", atributos: { value: "" } }),
          ...clientes.map((c) => crear("option", { texto: `${c.nombre} (${c.correo})`, atributos: { value: String(c.id_usuario) } })),
        ]);
        asig.value = u.id_propietario ? String(u.id_propietario) : "";
        asig.addEventListener("change", () => accion(async () => {
          const id = numeroONulo(asig.value);
          await servicios.asignarUnidad(u.id_vehiculo, id);
          avisar(id ? `Carrito ${u.id_vehiculo} asignado. El dueño anterior perdió el acceso.` : `Carrito ${u.id_vehiculo} liberado.`, "ok");
          alCambiarInventario?.();
        }, ["unidades"], () => { asig.value = u.id_propietario ? String(u.id_propietario) : ""; }));

        const editar = crear("button", { clase: "btn-icono", atributos: { type: "button", title: "Editar datos", "aria-label": `Editar ${u.nombre}` } }, [icono("bi-pencil")]);
        editar.addEventListener("click", () => { editando = u.id_vehiculo; pintar(); });

        const operable = !u.id_propietario || u.soporte_segundos > 0;
        const usar = crear("button", { clase: "btn-icono", atributos: { type: "button", title: operable ? "Usar en CONTROL" : "Vendido sin soporte: solo monitoreo", "aria-label": `Usar ${u.nombre}` } }, [icono(operable ? "bi-joystick" : "bi-eye")]);
        usar.addEventListener("click", () => {
          fijarVehiculo(u.id_vehiculo);
          irAControl?.(operable ? "control" : "monitoreo");
        });
        celdas.push(crear("td", {}, [crear("label", { clase: "form-check form-switch m-0" }, [activo])]),
          crear("td", {}, [est]), crear("td", {}, [asig]), crear("td", { texto: String(u.comandos) }),
          crear("td", {}, [editar]), crear("td", {}, [usar]));
      }
      const fila = crear("tr", {}, celdas);
      if (u.id_vehiculo === vehiculoActual()) fila.dataset.actual = "si";
      return fila;
    });
    const cabeza = ["ID", "Carrito", "Serie", "Estado", "Propietario"];
    if (!compacta) cabeza.push("Activo", "Cambiar estado", "Asignar a", "Comandos", "Editar", "Usar");
    return tabla(cabeza, filas, "Inventario de carritos");
  }

  // =================================================================
  // Modelos comerciales: alta, publicación y, por modelo, movimientos y demo
  // =================================================================
  function modelos() {
    const nombre = entrada("Nombre del modelo", { required: true, maxlength: 80, placeholder: "Vehículo Batman IoT" });
    const desc = entrada("Descripción", { maxlength: 500 });
    const micro = entrada("Microcontrolador", { maxlength: 50, placeholder: "ESP8266" });
    const precio = entrada("Precio (MXN)", { type: "number", min: 0, step: "0.01" });
    const form = formulario("Registrar modelo comercial", [nombre, desc, micro, precio], "Registrar modelo", async () => {
      await servicios.crearModelo({
        nombre: valor(nombre), descripcion: valor(desc) || null, microcontrolador: valor(micro) || null,
        precio: valor(precio) === "" ? null : Number(valor(precio)),
      });
      avisar(`Modelo «${valor(nombre)}» registrado.`, "ok");
      await cargar("modelos");
    });

    const filas = datos.modelos.map((m) => {
      const activo = crear("input", { clase: "form-check-input", atributos: { type: "checkbox", "aria-label": `Modelo ${m.nombre} activo` } });
      activo.checked = Boolean(m.activo);
      activo.addEventListener("change", () => accion(async () => {
        await servicios.actualizarModelo(m.id_modelo, { activo: activo.checked });
        avisar(`Modelo «${m.nombre}» ${activo.checked ? "publicado en el catálogo" : "retirado del catálogo"}.`, "ok");
      }, ["modelos"]));
      const gestionar = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-sliders"), crear("span", { texto: "Movimientos y demo" })]);
      gestionar.addEventListener("click", () => abrirModelo(m.id_modelo));
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(m.id_modelo) }),
        crear("td", {}, [crear("strong", { texto: m.nombre }), crear("small", { clase: "d-block nota-suave", texto: m.descripcion || "" })]),
        crear("td", { texto: m.microcontrolador || "—" }),
        crear("td", { texto: m.precio != null ? `$${Number(m.precio).toLocaleString("es-MX")}` : "—" }),
        crear("td", { texto: String(m.unidades) }),
        crear("td", { texto: String(m.unidades_exhibicion) }),
        crear("td", {}, [crear("label", { clase: "form-check form-switch m-0" }, [activo])]),
        crear("td", {}, [gestionar]),
      ]);
    });
    return crear("div", { clase: "admin-seccion" }, [
      form,
      errores.modelos ? alerta(errores.modelos) : bloque(`Modelos (${datos.modelos.length})`,
        filas.length ? tabla(["ID", "Modelo", "Micro", "Precio", "Carritos", "Exhibición", "En catálogo", "Gestionar"], filas, "Modelos comerciales") : vacio("Sin modelos.")),
    ]);
  }

  async function abrirModelo(id) {
    modeloId = id;
    datos.comandosModelo = null;
    borradorDemo = [];
    nombreDemoB = "";
    descDemoB = "";
    pintar();
    await cargar("comandosModelo");
  }

  function panelModelo() {
    const m = datos.modelos.find((x) => x.id_modelo === modeloId);
    const cerrar = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-x-lg"), crear("span", { texto: "Cerrar" })]);
    cerrar.addEventListener("click", () => { modeloId = null; pintar(); });
    const cabeza = crear("div", { clase: "bloque-cabeza" }, [crear("h3", { texto: `Movimientos y demo de «${m ? m.nombre : modeloId}»` }), cerrar]);
    const aviso = crear("p", { clase: "nota-suave", texto: "Lo que hagas aquí se aplica a TODOS los carritos de este modelo." });

    if (errores.comandosModelo) return crear("section", { clase: "bloque" }, [cabeza, alerta(errores.comandosModelo)]);
    const r = datos.comandosModelo;
    if (!r) return crear("section", { clase: "bloque" }, [cabeza, aviso, vacio("Cargando movimientos…")]);

    // ----- Movimientos: habilitar o deshabilitar en todo el modelo -----
    const filas = r.comandos.map((c) => {
      const total = c.unidades_con_comando;
      const en = c.unidades_habilitado;
      const casilla = crear("input", { clase: "form-check-input", atributos: { type: "checkbox", "aria-label": `Habilitar ${c.nombre} en todo el modelo` } });
      casilla.checked = total > 0 && en === total;
      casilla.indeterminate = en > 0 && en < total;
      casilla.addEventListener("change", () => accion(async () => {
        await servicios.habilitarComandoModelo(modeloId, c.nombre, casilla.checked);
        avisar(`${nombreLegible(c.nombre)} ${casilla.checked ? "habilitado" : "deshabilitado"} en ${total} carrito(s).`, "ok");
      }, ["comandosModelo"], () => { casilla.checked = total > 0 && en === total; }));
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(c.codigo) }),
        crear("td", { texto: nombreLegible(c.nombre) }),
        crear("td", { texto: `${en} de ${total} carritos` }),
        crear("td", {}, [crear("label", { clase: "form-check form-switch m-0" }, [casilla])]),
      ]);
    });

    const nombreC = entrada("Nombre (letras, números, _)", { required: true, maxlength: 60, pattern: "[A-Za-z0-9_ ]+", placeholder: "CLAXON" });
    const codigoC = entrada("Código (0-9999)", { type: "number", required: true, min: 0, max: 9999 });
    const descC = entrada("Descripción", { maxlength: 255 });
    const formComando = formulario("Agregar movimiento a todo el modelo", [nombreC, codigoC, descC], "Agregar a todos los carritos", async () => {
      const res = await servicios.agregarComandoModelo(modeloId, {
        nombre: valor(nombreC), codigo: Number(valor(codigoC)), descripcion: valor(descC) || null,
      });
      const omitidos = (res.errores || []).length;
      avisar(`Movimiento agregado a ${res.agregado_en} carrito(s)${omitidos ? `; omitido en ${omitidos} por conflicto` : ""}.`, omitidos ? "aviso" : "ok");
      await cargar("comandosModelo");
    });

    // ----- Demo de fábrica para el modelo -----
    const nombreD = crear("input", { clase: "form-control", atributos: { placeholder: "Nombre de la demo de fábrica", maxlength: "80", "aria-label": "Nombre de la demo de fábrica" } });
    nombreD.value = nombreDemoB;
    nombreD.addEventListener("input", () => { nombreDemoB = nombreD.value; });
    const descD = crear("input", { clase: "form-control", atributos: { placeholder: "Descripción (opcional)", maxlength: "255", "aria-label": "Descripción de la demo" } });
    descD.value = descDemoB;
    descD.addEventListener("input", () => { descDemoB = descD.value; });

    const nombresComando = r.comandos.map((c) => c.nombre);
    const filasPasos = borradorDemo.map((p, i) => {
      const cmd = crear("select", { clase: "form-select", atributos: { "aria-label": `Movimiento del paso ${i + 1}` } },
        nombresComando.map((n) => crear("option", { texto: nombreLegible(n), atributos: { value: n } })));
      cmd.value = p.comando;
      cmd.addEventListener("change", () => { p.comando = cmd.value; });
      const dur = crear("input", { clase: "form-control", atributos: { type: "number", min: "1", max: "60000", step: "100", "aria-label": `Duración del paso ${i + 1} en ms` } });
      dur.value = String(p.duracion_ms);
      dur.addEventListener("change", () => { p.duracion_ms = Math.min(Math.max(Number(dur.value) || 1, 1), 60000); });
      const pausa = crear("input", { clase: "form-control", atributos: { type: "number", min: "0", max: "60000", step: "100", "aria-label": `Pausa del paso ${i + 1} en ms` } });
      pausa.value = String(p.pausa_ms);
      pausa.addEventListener("change", () => { p.pausa_ms = Math.min(Math.max(Number(pausa.value) || 0, 0), 60000); });
      const quitar = crear("button", { clase: "btn-icono peligro", atributos: { type: "button", "aria-label": `Quitar paso ${i + 1}`, title: "Quitar paso" } }, [icono("bi-x-lg")]);
      quitar.addEventListener("click", () => { borradorDemo.splice(i, 1); pintar(); });
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(i + 1) }),
        crear("td", {}, [cmd]), crear("td", {}, [dur]), crear("td", {}, [pausa]), crear("td", {}, [quitar]),
      ]);
    });
    const agregarPaso = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-plus-lg"), crear("span", { texto: "Agregar paso" })]);
    agregarPaso.disabled = nombresComando.length === 0 || borradorDemo.length >= 30;
    agregarPaso.addEventListener("click", () => {
      borradorDemo.push({ comando: nombresComando.includes("AVANZAR") ? "AVANZAR" : nombresComando[0], duracion_ms: 1000, pausa_ms: 200 });
      pintar();
    });
    const crearDemo = crear("button", { clase: "btn-prim", atributos: { type: "button" } }, [icono("bi-cloud-check"), crear("span", { texto: "Crear demo de fábrica" })]);
    crearDemo.addEventListener("click", () => {
      if (!nombreDemoB.trim() || borradorDemo.length === 0) {
        avisar("La demo necesita un nombre y al menos un paso.", "aviso");
        return;
      }
      accion(async () => {
        const res = await servicios.demoModelo(modeloId, {
          nombre: nombreDemoB.trim(), descripcion: descDemoB.trim() || null, pasos: borradorDemo,
        });
        const omitidos = res.pasos_omitidos?.length ?? 0;
        avisar(`Demo «${nombreDemoB.trim()}» creada en ${res.creada_en} carrito(s)${omitidos ? `; ${omitidos} paso(s) omitidos por no existir en algún carrito` : ""}.`, "ok");
        borradorDemo = [];
        nombreDemoB = "";
        descDemoB = "";
      }, ["comandosModelo"]);
    });

    return crear("section", { clase: "bloque" }, [
      cabeza, aviso,
      crear("h4", { texto: "Movimientos del modelo" }),
      r.comandos.length ? tabla(["Código", "Movimiento", "Habilitado", "Activo"], filas, "Movimientos del modelo") : vacio("Este modelo todavía no tiene movimientos."),
      formComando,
      crear("h4", { texto: "Demo de fábrica del modelo" }),
      crear("p", { clase: "nota-suave", texto: "Se crea en cada carrito del modelo con estos mismos pasos. Un paso cuyo movimiento no exista en un carrito se omite y se informa." }),
      crear("div", { clase: "admin-form" }, [
        crear("label", { clase: "campo" }, [crear("span", { texto: "Nombre" }), nombreD]),
        crear("label", { clase: "campo" }, [crear("span", { texto: "Descripción" }), descD]),
        borradorDemo.length
          ? crear("div", { clase: "tabla-caja" }, [crear("table", { clase: "tabla" }, [
            crear("caption", { clase: "visually-hidden", texto: "Pasos de la demo" }),
            crear("thead", {}, [crear("tr", {}, ["#", "Movimiento", "Duración (ms)", "Pausa (ms)", ""].map((t) => crear("th", { texto: t, atributos: { scope: "col" } })))]),
            crear("tbody", {}, filasPasos),
          ])])
          : vacio("Sin pasos todavía."),
        crear("div", { clase: "form-pie" }, [agregarPaso, crearDemo]),
      ]),
    ]);
  }

  // =================================================================
  // Clientes: alta, sesiones activas y cuenta de cada cliente
  // =================================================================
  function clientes() {
    const nombre = entrada("Nombre completo", { required: true, maxlength: 80 });
    const correo = entrada("Correo", { required: true, type: "email", maxlength: 120, autocomplete: "off" });
    const contrasena = entrada("Contraseña inicial (mín. 8)", { required: true, type: "password", minlength: 8, autocomplete: "new-password" });
    const rol = selector("Rol", [["USUARIO", "Comprador (Usuario)"], ["ADMIN", "Administrador"]]);
    const tel = entrada("Teléfono", { maxlength: 30 });
    const form = formulario("Registrar cliente", [nombre, correo, contrasena, rol, tel], "Registrar cliente", async () => {
      await servicios.crearUsuario({
        nombre: valor(nombre), correo: valor(correo), contrasena: valor(contrasena), rol: valor(rol), telefono: valor(tel) || null,
      });
      avisar(`Cliente ${valor(correo)} registrado.`, "ok");
      await cargar("usuarios");
    });

    const filas = datos.usuarios.map((u) => {
      const activo = crear("input", { clase: "form-check-input", atributos: { type: "checkbox", "aria-label": `Cuenta de ${u.correo} activa` } });
      activo.checked = Boolean(u.activo);
      // Tu propia cuenta no se puede desactivar (te quedarías fuera); el servidor también lo impide
      if (u.id_usuario === sesion.get()?.usuario?.id_usuario) {
        activo.disabled = true;
        activo.title = "Es tu cuenta: no puedes desactivarte a ti mismo";
      }
      activo.addEventListener("change", () => accion(async () => {
        await servicios.actualizarUsuario(u.id_usuario, { activo: activo.checked });
        avisar(`Cuenta ${u.correo} ${activo.checked ? "activada" : "desactivada (baja lógica: conserva su historial)"}.`, "ok");
      }, ["usuarios"]));
      const cuenta = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-person-lines-fill"), crear("span", { texto: "Ver cuenta" })]);
      cuenta.addEventListener("click", () => abrirCuenta(u.id_usuario));
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(u.id_usuario) }),
        crear("td", {}, [crear("strong", { texto: u.nombre }), crear("small", { clase: "d-block nota-suave", texto: u.correo })]),
        crear("td", {}, [crear("span", { clase: `insignia insignia-${u.rol.toLowerCase()}`, texto: u.rol === "ADMIN" ? "Administrador" : "Comprador" })]),
        crear("td", { texto: String(u.unidades) }),
        crear("td", { texto: fechaCorta(aFecha(u.fecha_registro)) }),
        crear("td", {}, [crear("label", { clase: "form-check form-switch m-0" }, [activo])]),
        crear("td", {}, [cuenta]),
      ]);
    });
    return crear("div", { clase: "admin-seccion" }, [
      form,
      bloque("Sesiones activas", pintarSesiones()),
      errores.usuarios ? alerta(errores.usuarios) : bloque(`Cuentas (${datos.usuarios.length})`,
        filas.length ? tabla(["ID", "Cliente", "Rol", "Carritos", "Alta", "Activa", "Cuenta"], filas, "Clientes y administradores") : vacio("Sin cuentas.")),
    ]);
  }

  function pintarSesiones() {
    if (errores.sesiones) return alerta(errores.sesiones);
    if (!datos.sesiones) return vacio("Cargando sesiones…");
    const inicios = datos.sesiones.inicio_de_sesion || [];
    const pruebas = datos.sesiones.pruebas_de_invitado || [];
    const minutos = (s) => `${Math.ceil((s || 0) / 60)} min`;
    const tInicios = inicios.length
      ? tabla(["Nombre", "Correo", "Rol", "Expira en"], inicios.map((s) => crear("tr", {}, [
        crear("td", { texto: s.nombre }), crear("td", { texto: s.correo }),
        crear("td", { texto: s.rol === "ADMIN" ? "Administrador" : "Comprador" }), crear("td", { texto: minutos(s.segundos_restantes) }),
      ])), "Sesiones abiertas")
      : vacio("Nadie tiene sesión abierta.");
    const tPruebas = pruebas.length
      ? tabla(["Visitante", "Carrito", "Termina en"], pruebas.map((p) => crear("tr", {}, [
        crear("td", { texto: p.nombre_invitado || p.nombre || "Invitado" }),
        crear("td", { texto: p.vehiculo || `ID ${p.id_vehiculo}` }), crear("td", { texto: minutos(p.segundos_restantes) }),
      ])), "Pruebas de invitado en curso")
      : vacio("Sin pruebas de invitado en curso.");
    return crear("div", {}, [tInicios, crear("h4", { texto: "Pruebas de invitado" }), tPruebas]);
  }

  async function abrirCuenta(id) {
    cuentaId = id;
    datos.cuenta = null;
    pintar();
    await cargar("cuenta");
  }

  function panelCuenta() {
    const c = datos.cuenta;
    const cerrar = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-x-lg"), crear("span", { texto: "Cerrar cuenta" })]);
    cerrar.addEventListener("click", () => { cuentaId = null; pintar(); });
    const cabeza = crear("div", { clase: "bloque-cabeza" }, [crear("h3", { texto: c ? `Cuenta de ${c.usuario.nombre}` : "Cuenta de cliente" }), cerrar]);
    if (errores.cuenta) return crear("section", { clase: "bloque" }, [cabeza, alerta(errores.cuenta)]);
    if (!c) return crear("section", { clase: "bloque" }, [cabeza, vacio("Cargando cuenta…")]);

    const carritos = c.carritos.length
      ? tabla(["ID", "Carrito", "Serie", "Estado", "Activo", "Demos"], c.carritos.map((u) => {
        const demos = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [icono("bi-collection-play"), crear("span", { texto: "Ver y editar demos" })]);
        demos.addEventListener("click", () => { cuentaId = null; fijarVehiculo(u.id_vehiculo); ir("demos"); });
        return crear("tr", {}, [
          crear("td", { clase: "mon-num", texto: String(u.id_vehiculo) }), crear("td", { texto: u.nombre }),
          crear("td", { texto: u.numero_serie || "—" }), crear("td", { texto: ESTADO_TEXTO[u.estado_comercial] || u.estado_comercial }),
          crear("td", { texto: u.activo ? "Sí" : "No (dado de baja)" }), crear("td", {}, [demos]),
        ]);
      }), "Carritos del cliente")
      : vacio("Este cliente no tiene carritos.");
    const sesionesC = c.sesiones_activas.length
      ? tabla(["Correo", "Expira en"], c.sesiones_activas.map((s) => crear("tr", {}, [
        crear("td", { texto: s.correo }), crear("td", { texto: `${Math.ceil((s.segundos_restantes || 0) / 60)} min` }),
      ])), "Sesiones activas del cliente")
      : vacio("El cliente no tiene sesión abierta.");

    return crear("section", { clase: "bloque" }, [
      cabeza,
      crear("p", { clase: "nota-suave", texto: `${c.usuario.correo} · ${c.usuario.rol === "ADMIN" ? "Administrador" : "Comprador"} · ${c.usuario.activo ? "cuenta activa" : "cuenta inactiva"}` }),
      crear("h4", { texto: "Carritos" }), carritos,
      crear("h4", { texto: "Sesiones activas" }), sesionesC,
      crear("h4", { texto: "Bitácora del cliente" }),
      c.bitacora.length ? tablaAuditoria(c.bitacora) : vacio("Sin movimientos en la bitácora."),
      crear("p", { clase: "nota-suave", texto: "Como administrador puedes crear, editar y borrar las demos de sus carritos. Los movimientos individuales de un carrito vendido son solo de lectura: para moverlo hace falta su soporte autorizado." }),
    ]);
  }

  // =================================================================
  // Demos: cualquier carrito activo (las demos de fábrica se ven en todos;
  // las privadas, solo las del dueño actual)
  // =================================================================
  function demos() {
    const activas = datos.unidades.filter((u) => u.activo);
    const etiqueta = (u) => `${u.nombre} (ID ${u.id_vehiculo}) · ${u.id_propietario ? `cliente: ${u.propietario || "—"}` : "de fábrica (sin dueño)"}`;
    const sel = crear("select", { clase: "form-select", atributos: { "aria-label": "Carrito para gestionar demos" } },
      activas.map((u) => crear("option", { texto: etiqueta(u), atributos: { value: String(u.id_vehiculo) } })));
    if (activas.some((u) => u.id_vehiculo === vehiculoActual())) sel.value = String(vehiculoActual());
    sel.addEventListener("change", () => fijarVehiculo(Number(sel.value)));
    if (activas.length && !activas.some((u) => u.id_vehiculo === vehiculoActual())) {
      queueMicrotask(() => fijarVehiculo(activas[0].id_vehiculo));
    }
    editorEnPestana?.(cajaEditor);
    return crear("div", { clase: "admin-seccion" }, [
      crear("label", { clase: "campo" }, [crear("span", { texto: "Carrito" }), sel]),
      crear("p", { clase: "nota-suave", texto: "Como administrador creas, editas y borras demos en cualquier carrito, también en los vendidos: las de fábrica las ven todos, las privadas son del cliente. No mueves un carrito vendido sin su soporte autorizado." }),
      cajaEditor,
    ]);
  }

  // =================================================================
  // Auditoría
  // =================================================================
  function auditoria() {
    return crear("div", { clase: "admin-seccion" }, [
      errores.auditoria ? alerta(errores.auditoria) : bloque("Bitácora de acciones sensibles", tablaAuditoria(datos.auditoria)),
      crear("p", { clase: "nota-suave", texto: "Registra quién hizo qué, sobre qué recurso y con qué resultado. Nunca guarda contraseñas ni tokens." }),
    ]);
  }

  function tablaAuditoria(lista) {
    if (lista.length === 0) return vacio("Sin registros.");
    const filas = lista.map((a) => {
      const f = aFecha(a.fecha_hora);
      return crear("tr", {}, [
        crear("td", { clase: "mon-hora", texto: `${fechaCorta(f)} ${horaLocal(f)}` }),
        crear("td", { texto: a.actor }),
        crear("td", {}, [crear("span", { clase: "insignia", texto: a.accion })]),
        crear("td", { texto: `${a.recurso}${a.id_recurso ? ` #${a.id_recurso}` : ""}` }),
        crear("td", {}, [crear("span", { clase: `resultado r-${(a.resultado || "").toLowerCase()}`, texto: a.resultado })]),
        crear("td", { clase: "nota-suave", texto: a.detalle || "" }),
      ]);
    });
    return tabla(["Fecha y hora", "Actor", "Acción", "Recurso", "Resultado", "Detalle"], filas, "Auditoría");
  }

  // =================================================================
  // Utilidades de interfaz
  // =================================================================
  async function accion(fn, recargar = [], alFallar) {
    try {
      await fn();
    } catch (error) {
      avisar(mensajeDeError(error), "error");
      alFallar?.();
    }
    if (recargar.length) await cargar(...recargar);
  }

  function entrada(etiqueta, atributos = {}) {
    const attrs = { type: "text", ...Object.fromEntries(Object.entries(atributos).map(([k, v]) => [k, String(v)])) };
    if (atributos.required) attrs.required = "";
    const input = crear("input", { clase: "form-control", atributos: attrs });
    return crear("label", { clase: "campo" }, [crear("span", { texto: etiqueta }), input]);
  }

  function selector(etiqueta, opciones) {
    const sel = crear("select", { clase: "form-select" }, opciones.map(([v, t]) => crear("option", { texto: t, atributos: { value: String(v) } })));
    return crear("label", { clase: "campo" }, [crear("span", { texto: etiqueta }), sel]);
  }

  function valor(campo) {
    return campo.querySelector("input,select").value.trim();
  }

  function numeroONulo(v) {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) ? n : null;
  }

  function formulario(titulo, campos, textoBoton, alEnviar) {
    const boton = crear("button", { clase: "btn-prim", atributos: { type: "submit" } }, [icono("bi-plus-lg"), crear("span", { texto: textoBoton })]);
    const nota = crear("p", { clase: "form-nota", atributos: { role: "status" } });
    const form = crear("form", { clase: "admin-form" }, [
      crear("h3", { texto: titulo }), crear("div", { clase: "campos" }, campos), crear("div", { clase: "form-pie" }, [nota, boton]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      boton.disabled = true;
      nota.textContent = "Guardando…";
      nota.dataset.tipo = "";
      try {
        await alEnviar();
        form.reset();
        nota.textContent = "";
      } catch (error) {
        nota.textContent = mensajeDeError(error);
        nota.dataset.tipo = "error";
      } finally {
        boton.disabled = false;
      }
    });
    const detalles = crear("details", { clase: "admin-plegable" }, [
      crear("summary", {}, [icono("bi-plus-circle"), crear("span", { texto: titulo })]), form,
    ]);
    return detalles;
  }

  function tabla(cabeza, filas, titulo) {
    return crear("div", { clase: "tabla-caja" }, [
      crear("table", { clase: "tabla" }, [
        crear("caption", { clase: "visually-hidden", texto: titulo }),
        crear("thead", {}, [crear("tr", {}, cabeza.map((t) => crear("th", { texto: t, atributos: { scope: "col" } })))]),
        crear("tbody", {}, filas),
      ]),
    ]);
  }

  function bloque(titulo, contenido, alVerTodo) {
    const cabeza = [crear("h3", { texto: titulo })];
    if (alVerTodo) {
      const b = crear("button", { clase: "btn-texto-sm", atributos: { type: "button" } }, [crear("span", { texto: "Ver todo" }), icono("bi-chevron-right")]);
      b.addEventListener("click", alVerTodo);
      cabeza.push(b);
    }
    return crear("section", { clase: "bloque" }, [crear("div", { clase: "bloque-cabeza" }, cabeza), contenido]);
  }

  const vacio = (texto) => crear("p", { clase: "vacio", texto });
  const alerta = (texto) => crear("p", { clase: "alerta", atributos: { role: "alert" } }, [icono("bi-exclamation-triangle"), crear("span", { texto: `Sin datos: ${texto}` })]);

  return {
    abrir: () => ir(pestana),
    recargarUnidades: () => cargar("unidades"),
    nombreLegible,
  };
}
