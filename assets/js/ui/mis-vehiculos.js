// Vista «Mis vehículos» (4.3, rol USUARIO).
//
// Lista SOLO las unidades del comprador: la API saca el id del token, así que
// no hay forma de pedir la lista de otra persona. Elegir una unidad cambia la
// que usan CONTROL y MONITOREO, y debajo se editan sus demos privadas.
import { fijarVehiculo, vehiculoActual } from "../estado/contexto.js";
import { crear, icono } from "../utils/dom.js";
import { mensajeDeError } from "../utils/errores.js";

export function crearMisVehiculos({ contenedor, servicios, avisar, irA, cajaEditor }) {
  let unidades = [];
  let error = "";
  let cargado = false;

  const lista = crear("div", { clase: "mis-lista" });
  contenedor.replaceChildren(
    crear("div", { clase: "bloque-cabeza" }, [crear("h2", { texto: "Mis vehículos" })]),
    lista,
    crear("section", { clase: "bloque" }, [cajaEditor]),
  );

  async function cargar() {
    try {
      unidades = await servicios.misVehiculos();
      error = "";
    } catch (e) {
      error = mensajeDeError(e);
    }
    cargado = true;
    pintar();
    return unidades;
  }

  function pintar() {
    if (error) {
      lista.replaceChildren(crear("p", { clase: "alerta", texto: `Sin datos: ${error}` }));
      return;
    }
    if (!cargado) {
      lista.replaceChildren(crear("p", { clase: "vacio", texto: "Cargando tus unidades…" }));
      return;
    }
    if (unidades.length === 0) {
      lista.replaceChildren(crear("p", { clase: "vacio", texto: "Todavía no tienes unidades asignadas. Cuando la empresa te asigne una, aparecerá aquí." }));
      return;
    }
    lista.replaceChildren(...unidades.map((u) => {
      const actual = u.id_vehiculo === vehiculoActual();
      const usar = crear("button", { clase: actual ? "btn-sec" : "btn-prim", atributos: { type: "button" } }, [
        icono(actual ? "bi-check2-circle" : "bi-joystick"), crear("span", { texto: actual ? "Seleccionada" : "Usar esta unidad" }),
      ]);
      usar.addEventListener("click", () => {
        if (fijarVehiculo(u.id_vehiculo)) avisar(`Ahora controlas «${u.nombre}».`, "ok");
        pintar();
        irA("control");
      });
      return crear("article", { clase: "mi-unidad", atributos: { "data-actual": actual ? "si" : "" } }, [
        icono("bi-truck-front"),
        crear("div", { clase: "mi-unidad-texto" }, [
          crear("strong", { texto: u.nombre }),
          crear("span", { texto: `${u.modelo || "Sin modelo"} · Serie ${u.numero_serie || "—"}` }),
        ]),
        usar,
        soporte(u),
      ]);
    }));
  }

  // ----- Autorización de soporte para la empresa -----
  // El servidor decide; aquí solo se pide y se muestra el tiempo que queda.
  function soporte(u) {
    const segundos = Number(u.soporte_segundos) || 0;
    const caja = crear("div", { clase: "soporte", atributos: { "data-activo": segundos > 0 ? "si" : "" } });
    if (segundos > 0) {
      const hasta = new Date(Date.now() + segundos * 1000);
      const hora = hasta.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      const revocar = crear("button", { clase: "btn-sec peligro", atributos: { type: "button" } }, [
        icono("bi-shield-x"), crear("span", { texto: "Revocar" }),
      ]);
      revocar.addEventListener("click", async () => {
        revocar.disabled = true;
        try {
          await servicios.revocarSoporte(u.id_vehiculo);
          avisar("Soporte revocado: la empresa ya no puede operar tu unidad.", "ok");
        } catch (e) {
          avisar(`Revocar soporte: ${mensajeDeError(e)}`, "error");
        }
        await cargar();
      });
      caja.append(
        icono("bi-shield-check"),
        crear("span", { texto: `La empresa tiene soporte autorizado hasta las ${hora}.` }),
        revocar,
      );
    } else {
      const minutos = crear("select", { clase: "form-select form-select-sm", atributos: { "aria-label": `Duración del soporte para ${u.nombre}` } },
        [15, 30, 60, 120].map((m) => crear("option", { texto: `${m} min`, atributos: { value: String(m) } })));
      minutos.value = "30";
      const autorizar = crear("button", { clase: "btn-sec", atributos: { type: "button" } }, [
        icono("bi-shield-plus"), crear("span", { texto: "Autorizar soporte" }),
      ]);
      autorizar.addEventListener("click", async () => {
        autorizar.disabled = true;
        try {
          await servicios.autorizarSoporte(u.id_vehiculo, Number(minutos.value));
          avisar(`Autorizaste a la empresa a operar «${u.nombre}» durante ${minutos.value} minutos.`, "ok");
        } catch (e) {
          avisar(`Autorizar soporte: ${mensajeDeError(e)}`, "error");
        }
        await cargar();
      });
      caja.append(
        icono("bi-shield-lock"),
        crear("span", { texto: "La empresa solo puede monitorear esta unidad." }),
        minutos,
        autorizar,
      );
    }
    return caja;
  }

  return { cargar, pintar, unidades: () => unidades };
}
