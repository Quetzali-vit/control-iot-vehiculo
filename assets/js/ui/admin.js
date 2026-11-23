// Vista ADMINISTRACIÓN (4.3, solo rol ADMIN).
//
// Todo dato viene de la API respaldada por Amazon RDS; si algo no se pudo leer
// se dice «Sin datos», nunca se simula. Ocultar esta vista a otros roles es solo
// comodidad: la seguridad real es que la API responde 403 a quien no es ADMIN.
import { fijarVehiculo, vehiculoActual } from "../estado/contexto.js";
import { sesion } from "../estado/sesion.js";
import { crear, icono, nombreLegible } from "../utils/dom.js";
import { aFecha, fechaCorta, horaLocal } from "../utils/fechas.js";
import { mensajeDeError } from "../utils/errores.js";

const ESTADOS = ["DISPONIBLE", "VENDIDO", "EXHIBICION", "INACTIVO"];
const ESTADO_TEXTO = { DISPONIBLE: "Disponible", VENDIDO: "Vendida / asignada", EXHIBICION: "Exhibición", INACTIVO: "Inactiva" };

export function crearVistaAdmin({ contenedor, servicios, avisar, editorEnPestana, alCambiarInventario, irAControl }) {
  let pestana = "dashboard";
  let datos = { metricas: null, unidades: [], modelos: [], usuarios: [], auditoria: [] };
  let errores = {};

  const pestanas = [
    ["dashboard", "bi-speedometer2", "Dashboard"],
    ["unidades", "bi-truck-front", "Unidades"],
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

  // =================================================================
  async function cargar(...cuales) {
    const tareas = {
      metricas: () => servicios.metricas(),
      unidades: () => servicios.unidades(),
      modelos: () => servicios.modelos(),
      usuarios: () => servicios.usuarios(),
      auditoria: () => servicios.auditoria(60),
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
      clientes: ["usuarios"],
      demos: ["unidades"],
      auditoria: ["auditoria"],
    }[clave];
    cargar(...necesita);
  }

  function pintar() {
    const vistas = { dashboard, unidades, modelos, clientes, demos, auditoria };
    cuerpo.replaceChildren(vistas[pestana]());
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
      tile("bi-truck-front", m?.unidades, "Unidades"),
      tile("bi-bag-check", m?.vendidas, "Vendidas / asignadas", "t-ok"),
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
        bloque("Inventario reciente", resumen, () => ir("unidades")),
        bloque("Últimas acciones", ultimas, () => ir("auditoria")),
      ]),
    ]);
  }

  // =================================================================
  // Unidades físicas
  // =================================================================
  function unidades() {
    const nombre = entrada("Nombre de la unidad", { required: true, maxlength: 80, placeholder: "Retroexcavadora 002" });
    const modelo = selector("Modelo", [["", "Sin modelo"], ...datos.modelos.filter((x) => x.activo).map((x) => [x.id_modelo, x.nombre])]);
    const serie = entrada("Número de serie (único)", { maxlength: 40, placeholder: "UNI-0002" });
    const estado = selector("Estado comercial", ESTADOS.filter((e) => e !== "VENDIDO").map((e) => [e, ESTADO_TEXTO[e]]));
    const micro = entrada("Microcontrolador", { maxlength: 50, placeholder: "ESP32" });
    const copiar = selector("Copiar comandos de", [["", "No copiar"], ...datos.unidades.filter((u) => u.comandos > 0).map((u) => [u.id_vehiculo, `${u.nombre} (${u.comandos} comandos)`])]);

    const form = formulario("Registrar unidad física", [nombre, modelo, serie, estado, micro, copiar], "Registrar unidad", async () => {
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
      avisar(`Unidad registrada con ID ${id_vehiculo}${origen ? " y comandos copiados" : ""}.`, "ok");
      alCambiarInventario?.();
      await cargar("unidades");
    });

    return crear("div", { clase: "admin-seccion" }, [
      form,
      errores.unidades ? alerta(errores.unidades) : bloque(`Inventario (${datos.unidades.length})`, tablaUnidades(datos.unidades)),
    ]);
  }

  function tablaUnidades(lista, { compacta = false } = {}) {
    if (lista.length === 0) return vacio("No hay unidades registradas.");
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
        // Cambiar estado comercial
        const est = crear("select", { clase: "form-select form-select-sm", atributos: { "aria-label": `Estado comercial de ${u.nombre}` } },
          ESTADOS.map((e) => crear("option", { texto: ESTADO_TEXTO[e], atributos: { value: e } })));
        est.value = u.estado_comercial;
        est.addEventListener("change", () => accion(async () => {
          await servicios.cambiarComercial(u.id_vehiculo, { estado_comercial: est.value });
          avisar(`Unidad ${u.id_vehiculo}: ${ESTADO_TEXTO[est.value]}.`, "ok");
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
          avisar(id ? `Unidad ${u.id_vehiculo} asignada. El dueño anterior perdió el acceso.` : `Unidad ${u.id_vehiculo} liberada.`, "ok");
          alCambiarInventario?.();
        }, ["unidades"], () => { asig.value = u.id_propietario ? String(u.id_propietario) : ""; }));

        const operable = !u.id_propietario || u.soporte_segundos > 0;
        const usar = crear("button", { clase: "btn-icono", atributos: { type: "button", title: operable ? "Usar en CONTROL" : "Vendida sin soporte: solo monitoreo", "aria-label": `Usar ${u.nombre}` } }, [icono(operable ? "bi-joystick" : "bi-eye")]);
        usar.addEventListener("click", () => {
          fijarVehiculo(u.id_vehiculo);
          irAControl?.(operable ? "control" : "monitoreo");
        });
        celdas.push(crear("td", {}, [est]), crear("td", {}, [asig]), crear("td", { texto: String(u.comandos) }), crear("td", {}, [usar]));
      }
      const fila = crear("tr", {}, celdas);
      if (u.id_vehiculo === vehiculoActual()) fila.dataset.actual = "si";
      return fila;
    });
    const cabeza = ["ID", "Unidad", "Serie", "Estado", "Propietario"];
    if (!compacta) cabeza.push("Cambiar estado", "Asignar a", "Comandos", "Usar");
    return tabla(cabeza, filas, "Inventario de unidades físicas");
  }

  // =================================================================
  // Modelos comerciales
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
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(m.id_modelo) }),
        crear("td", {}, [crear("strong", { texto: m.nombre }), crear("small", { clase: "d-block nota-suave", texto: m.descripcion || "" })]),
        crear("td", { texto: m.microcontrolador || "—" }),
        crear("td", { texto: m.precio != null ? `$${Number(m.precio).toLocaleString("es-MX")}` : "—" }),
        crear("td", { texto: String(m.unidades) }),
        crear("td", { texto: String(m.unidades_exhibicion) }),
        crear("td", {}, [crear("label", { clase: "form-check form-switch m-0" }, [activo])]),
      ]);
    });
    return crear("div", { clase: "admin-seccion" }, [
      form,
      errores.modelos ? alerta(errores.modelos) : bloque(`Modelos (${datos.modelos.length})`,
        filas.length ? tabla(["ID", "Modelo", "Micro", "Precio", "Unidades", "Exhibición", "En catálogo"], filas, "Modelos comerciales") : vacio("Sin modelos.")),
    ]);
  }

  // =================================================================
  // Clientes
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
      return crear("tr", {}, [
        crear("td", { clase: "mon-num", texto: String(u.id_usuario) }),
        crear("td", {}, [crear("strong", { texto: u.nombre }), crear("small", { clase: "d-block nota-suave", texto: u.correo })]),
        crear("td", {}, [crear("span", { clase: `insignia insignia-${u.rol.toLowerCase()}`, texto: u.rol === "ADMIN" ? "Administrador" : "Comprador" })]),
        crear("td", { texto: String(u.unidades) }),
        crear("td", { texto: fechaCorta(aFecha(u.fecha_registro)) }),
        crear("td", {}, [crear("label", { clase: "form-check form-switch m-0" }, [activo])]),
      ]);
    });
    return crear("div", { clase: "admin-seccion" }, [
      form,
      errores.usuarios ? alerta(errores.usuarios) : bloque(`Cuentas (${datos.usuarios.length})`,
        filas.length ? tabla(["ID", "Cliente", "Rol", "Unidades", "Alta", "Activa"], filas, "Clientes y administradores") : vacio("Sin cuentas.")),
    ]);
  }

  // =================================================================
  // Demos de fábrica
  // =================================================================
  function demos() {
    const operables = datos.unidades.filter((u) => !u.id_propietario && u.activo);
    const sel = crear("select", { clase: "form-select", atributos: { "aria-label": "Unidad para editar demos de fábrica" } },
      operables.map((u) => crear("option", { texto: `${u.nombre} (ID ${u.id_vehiculo})`, atributos: { value: String(u.id_vehiculo) } })));
    if (operables.some((u) => u.id_vehiculo === vehiculoActual())) sel.value = String(vehiculoActual());
    sel.addEventListener("change", () => fijarVehiculo(Number(sel.value)));
    if (operables.length && !operables.some((u) => u.id_vehiculo === vehiculoActual())) {
      queueMicrotask(() => fijarVehiculo(operables[0].id_vehiculo));
    }
    editorEnPestana?.(cajaEditor);
    return crear("div", { clase: "admin-seccion" }, [
      crear("label", { clase: "campo" }, [crear("span", { texto: "Unidad (solo las que no tienen dueño)" }), sel]),
      crear("p", { clase: "nota-suave", texto: "Las unidades vendidas pertenecen al comprador: la empresa no edita ni ejecuta demos en ellas sin su autorización." }),
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
