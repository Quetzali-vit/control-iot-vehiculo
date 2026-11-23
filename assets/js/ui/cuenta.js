// Cabecera de la sesión (4.3): quién está dentro, cerrar sesión, selector de
// unidad y, para el invitado, la cuenta regresiva de su prueba.
import { servicios } from "../api/servicios.js";
import { sesion } from "../estado/sesion.js";
import { alCambiarVehiculo, fijarVehiculo, vehiculoActual } from "../estado/contexto.js";
import { $, crear } from "../utils/dom.js";

const ROLES = { ADMIN: "Administrador", USUARIO: "Comprador", INVITADO: "Invitado" };

export function crearCuenta({ avisar, alTerminarPrueba }) {
  const nombre = $("#cuenta-nombre");
  const rol = $("#cuenta-rol");
  const salir = $("#btn-salir");
  const selector = $("#sel-vehiculo");
  const fijo = $("#vehiculo-fijo");
  const banner = $("#banner-prueba");
  const reloj = $("#prueba-reloj");
  const terminar = $("#btn-terminar-prueba");

  const datos = sesion.get();
  const clave = sesion.rol();
  document.body.dataset.rol = clave;
  nombre.textContent = sesion.esInvitado() ? "Invitado" : (datos?.usuario?.nombre || datos?.usuario?.correo || "");
  rol.textContent = ROLES[clave] || clave;
  rol.dataset.rol = clave;

  salir.addEventListener("click", async () => {
    salir.disabled = true;
    try {
      if (sesion.esInvitado()) await servicios.terminarPrueba();
      else await servicios.logout();
    } catch {
      // aunque falle, la sesión local se borra
    }
    sesion.borrar();
    location.reload();
  });

  // ----- Selector de unidad -----
  let opciones = [];

  /** @param {{id_vehiculo:number, nombre:string, etiqueta?:string, deshabilitada?:boolean}[]} lista */
  function fijarOpciones(lista) {
    opciones = lista;
    selector.replaceChildren(...lista.map((u) => {
      const opcion = crear("option", { texto: u.etiqueta || u.nombre, atributos: { value: String(u.id_vehiculo) } });
      return opcion;
    }));
    selector.hidden = lista.length === 0;
    fijo.hidden = lista.length > 0;
    if (lista.some((u) => u.id_vehiculo === vehiculoActual())) selector.value = String(vehiculoActual());
  }

  // Si la unidad cambia desde otra vista (p. ej. «Usar esta unidad»), el selector la refleja
  alCambiarVehiculo((id) => {
    if (opciones.some((u) => u.id_vehiculo === id)) selector.value = String(id);
  });

  selector.addEventListener("change", () => {
    const id = Number.parseInt(selector.value, 10);
    if (fijarVehiculo(id)) {
      const u = opciones.find((o) => o.id_vehiculo === id);
      avisar(`Unidad cambiada: ${u?.nombre ?? id}.`, "ok");
    }
  });

  function mostrarFijo(texto) {
    selector.hidden = true;
    fijo.hidden = false;
    fijo.textContent = texto;
  }

  // ----- Cuenta regresiva del invitado -----
  let temporizador = null;
  let fin = 0;

  function iniciarCuenta(segundos) {
    banner.hidden = false;
    fin = Date.now() + Math.max(0, segundos) * 1000;
    clearInterval(temporizador);
    const pintar = () => {
      const resto = Math.max(0, Math.round((fin - Date.now()) / 1000));
      const m = Math.floor(resto / 60);
      const s = String(resto % 60).padStart(2, "0");
      reloj.textContent = `${m}:${s}`;
      banner.dataset.urgente = resto <= 60 ? "si" : "";
      if (resto <= 0) {
        clearInterval(temporizador);
        alTerminarPrueba("El tiempo de tu prueba terminó. La unidad se detuvo y quedó libre.");
      }
    };
    pintar();
    temporizador = setInterval(pintar, 1000);
  }

  terminar.addEventListener("click", async () => {
    terminar.disabled = true;
    try {
      await servicios.terminarPrueba();
    } catch {
      // si ya había vencido, da igual
    }
    alTerminarPrueba("Terminaste tu prueba. La unidad se detuvo y quedó libre para otra persona.");
  });

  return { fijarOpciones, mostrarFijo, iniciarCuenta };
}
