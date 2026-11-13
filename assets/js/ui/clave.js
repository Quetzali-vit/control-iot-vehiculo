// Clave de control (X-API-Key).
// Si CONFIG.API_KEY tiene valor, se usa esa y la pestaña «Clave» se oculta.
// Si está vacía, la escribe el operador: vive en memoria y, si se elige,
// en sessionStorage de esta pestaña.
import { CONFIG } from "../config.js";
import { $ } from "../utils/dom.js";

const LLAVE_SESION = "control-iot:clave";

function leerSesion() {
  try {
    return sessionStorage.getItem(LLAVE_SESION) || "";
  } catch {
    return "";
  }
}

function guardarSesion(valor) {
  try {
    if (valor) sessionStorage.setItem(LLAVE_SESION, valor);
    else sessionStorage.removeItem(LLAVE_SESION);
  } catch {
    // Navegación privada o almacenamiento bloqueado: la clave queda solo en memoria
  }
}

export function crearClave(store) {
  const boton = $("#btn-clave");
  const panel = $("#panel-clave");
  const formulario = $("#form-clave");
  const campo = $("#campo-clave");
  const recordar = $("#recordar-clave");
  const mostrar = $("#mostrar-clave");
  const borrar = $("#borrar-clave");
  const cerrarBoton = $("#cerrar-clave");
  const nota = $("#clave-nota");

  const claveFija = (CONFIG.API_KEY ?? "").trim();
  let clave = claveFija || leerSesion();

  function actualizar() {
    store.set({ hayClave: Boolean(clave) });
    boton.hidden = Boolean(claveFija);
    boton.dataset.estado = clave ? "lista" : "falta";
    boton.querySelector(".clave-texto").textContent = clave ? "Clave lista" : "Clave";
    borrar.hidden = !clave;
  }

  function abrir(mensaje = "", invalida = false) {
    if (invalida) {
      // Si la clave fija del código fue rechazada, se permite escribir otra a mano
      clave = "";
      guardarSesion("");
      boton.hidden = false;
      boton.dataset.estado = "falta";
      boton.querySelector(".clave-texto").textContent = "Clave";
      borrar.hidden = true;
      store.set({ hayClave: false });
    }
    if (!panel.open) panel.showModal();
    nota.textContent = mensaje || "La clave se usa solo para mover, iniciar o cancelar. No se guarda en GitHub.";
    nota.dataset.tipo = mensaje ? "aviso" : "";
    campo.focus();
  }

  function cerrar() {
    if (panel.open) panel.close();
  }

  boton.addEventListener("click", () => (panel.open ? cerrar() : abrir()));
  cerrarBoton.addEventListener("click", cerrar);
  // Clic en el fondo oscuro (fuera de la tarjeta) cierra el diálogo
  panel.addEventListener("click", (evento) => {
    if (evento.target === panel) cerrar();
  });

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const valor = campo.value.trim();
    if (!valor) {
      nota.textContent = "Escribe la clave antes de guardar.";
      nota.dataset.tipo = "aviso";
      return;
    }
    clave = valor;
    guardarSesion(recordar.checked ? valor : "");
    campo.value = "";
    actualizar();
    cerrar();
  });

  mostrar.addEventListener("change", () => {
    campo.type = mostrar.checked ? "text" : "password";
  });

  borrar.addEventListener("click", () => {
    clave = "";
    guardarSesion("");
    actualizar();
    nota.textContent = "Clave borrada de esta pestaña.";
    nota.dataset.tipo = "";
  });

  actualizar();

  return {
    obtener: () => clave,
    pedir: abrir,
  };
}
