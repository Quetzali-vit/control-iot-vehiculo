// Pantalla de acceso (4.3): iniciar sesión o probar como invitado.
//
// Iniciar sesión guarda el token que devuelve la API y recarga la aplicación ya
// identificada. «Probar» pide al servidor una sesión temporal sobre una unidad
// de exhibición: el servidor decide qué unidad, cuánto dura y qué comandos se
// permiten; aquí solo se muestra.
import { servicios } from "../api/servicios.js";
import { sesion } from "../estado/sesion.js";
import { fijarVehiculo } from "../estado/contexto.js";
import { $, crear, icono } from "../utils/dom.js";
import { mensajeDeError } from "../utils/errores.js";

export function mostrarAcceso(motivo = "") {
  const pantalla = $("#acceso");
  const formulario = $("#form-login");
  const correo = $("#login-correo");
  const contrasena = $("#login-contrasena");
  const nota = $("#login-nota");
  const boton = $("#btn-login");
  const lista = $("#catalogo-lista");
  const estadoCatalogo = $("#catalogo-estado");
  const nombreInvitado = $("#invitado-nombre");

  document.body.dataset.rol = "ANONIMO";
  pantalla.hidden = false;
  $("#app").hidden = true;
  $("#nav").hidden = true;

  if (motivo) {
    nota.textContent = motivo;
    nota.dataset.tipo = "aviso";
  }

  $("#mostrar-contrasena").addEventListener("change", (e) => {
    contrasena.type = e.target.checked ? "text" : "password";
  });

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!correo.value.trim() || !contrasena.value) {
      nota.textContent = "Escribe tu correo y tu contraseña.";
      nota.dataset.tipo = "aviso";
      return;
    }
    boton.disabled = true;
    nota.textContent = "Verificando…";
    nota.dataset.tipo = "";
    try {
      const datos = await servicios.login(correo.value.trim(), contrasena.value);
      contrasena.value = "";
      sesion.guardar({ token: datos.token, tipo: "usuario", usuario: datos.usuario });
      location.reload();
    } catch (error) {
      nota.textContent = error?.status === 401 ? "Correo o contraseña incorrectos." : mensajeDeError(error);
      nota.dataset.tipo = "error";
      boton.disabled = false;
      contrasena.focus();
      contrasena.select();
    }
  });

  async function cargarCatalogo() {
    estadoCatalogo.hidden = false;
    estadoCatalogo.textContent = "Cargando catálogo…";
    try {
      const modelos = await servicios.catalogo();
      lista.replaceChildren(...modelos.map(tarjetaModelo));
      estadoCatalogo.hidden = modelos.length > 0;
      if (modelos.length === 0) estadoCatalogo.textContent = "Todavía no hay modelos publicados.";
    } catch (error) {
      estadoCatalogo.textContent = `No se pudo cargar el catálogo: ${mensajeDeError(error)}`;
    }
  }

  function tarjetaModelo(m) {
    const libres = Number(m.disponibles) || 0;
    const exhibicion = Number(m.unidades_exhibicion) || 0;
    const boton = crear("button", { clase: "btn-probar", atributos: { type: "button" } }, [
      icono("bi-joystick"), crear("span", { texto: libres > 0 ? "Probar ahora" : "Ocupado" }),
    ]);
    boton.disabled = libres === 0;
    boton.addEventListener("click", () => iniciarPrueba(m, boton));

    let disponibilidad = "Sin unidades de exhibición";
    if (exhibicion > 0) disponibilidad = libres > 0 ? `${libres} de ${exhibicion} libre(s) para probar` : "En uso por otra persona. Intenta en unos minutos.";

    return crear("article", { clase: "modelo-tarjeta" }, [
      crear("div", { clase: "modelo-cabeza" }, [
        crear("h3", { texto: m.nombre }),
        ...(m.precio != null ? [crear("span", { clase: "modelo-precio", texto: `$${Number(m.precio).toLocaleString("es-MX")}` })] : []),
      ]),
      crear("p", { clase: "modelo-desc", texto: m.descripcion || "Sin descripción." }),
      crear("p", { clase: "modelo-meta" }, [
        icono("bi-cpu"), crear("span", { texto: m.microcontrolador || "Microcontrolador no indicado" }),
      ]),
      crear("p", { clase: "modelo-disp", atributos: { "data-libre": libres > 0 ? "si" : "no" } }, [
        icono(libres > 0 ? "bi-check-circle" : "bi-hourglass-split"), crear("span", { texto: disponibilidad }),
      ]),
      boton,
    ]);
  }

  async function iniciarPrueba(modelo, boton) {
    boton.disabled = true;
    estadoCatalogo.hidden = false;
    estadoCatalogo.textContent = `Reservando una unidad de «${modelo.nombre}»…`;
    try {
      const prueba = await servicios.iniciarPrueba(modelo.id_modelo, nombreInvitado.value.trim() || "Invitado");
      sesion.guardar({
        token: prueba.token,
        tipo: "invitado",
        prueba: {
          id_vehiculo: prueba.id_vehiculo,
          modelo: prueba.modelo,
          vehiculo: prueba.vehiculo,
          comandos_permitidos: prueba.comandos_permitidos,
        },
      });
      fijarVehiculo(prueba.id_vehiculo, { recordar: false });
      location.reload();
    } catch (error) {
      estadoCatalogo.textContent = error?.status === 409
        ? "Esa unidad ya la está probando otra persona. Intenta en unos minutos."
        : `No se pudo iniciar la prueba: ${mensajeDeError(error)}`;
      boton.disabled = false;
      cargarCatalogo();
    }
  }

  $("#btn-recargar-catalogo").addEventListener("click", cargarCatalogo);
  cargarCatalogo();
  correo.focus();
}
