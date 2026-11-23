// Unidad (vehículo) sobre la que trabajan CONTROL y MONITOREO en este momento.
//
// En 4.1/4.2 era fija (vehículo 1). En 4.3 cada comprador elige entre SUS
// unidades, el Administrador entre el inventario y el invitado tiene fija la
// unidad de exhibición que reservó. Cambiar de unidad cierra la suscripción
// WebSocket anterior y vuelve a cargar todo desde la API.

import { CONFIG } from "../config.js";

const LLAVE = "control-iot:vehiculo";
const oyentes = new Set();

let actual = leerGuardado();

function leerGuardado() {
  try {
    const valor = Number.parseInt(localStorage.getItem(LLAVE) || "", 10);
    return Number.isInteger(valor) && valor > 0 ? valor : CONFIG.VEHICLE_ID_POR_DEFECTO;
  } catch {
    return CONFIG.VEHICLE_ID_POR_DEFECTO;
  }
}

/** Id de la unidad seleccionada. */
export function vehiculoActual() {
  return actual;
}

/** Cambia la unidad. Devuelve true si realmente cambió. */
export function fijarVehiculo(id, { recordar = true } = {}) {
  const nuevo = Number(id);
  if (!Number.isInteger(nuevo) || nuevo < 1) return false;
  if (recordar) {
    try {
      localStorage.setItem(LLAVE, String(nuevo));
    } catch {
      // sin almacenamiento solo dura la visita
    }
  }
  if (nuevo === actual) return false;
  actual = nuevo;
  for (const fn of oyentes) fn(nuevo);
  return true;
}

/** Avisa cada vez que cambia la unidad. */
export function alCambiarVehiculo(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
