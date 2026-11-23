// Sesión del navegador (práctica 4.3).
//
// Guarda el token que entrega la API al iniciar sesión (o al pedir una prueba de
// invitado). Es un token temporal y revocable, no una contraseña: la contraseña
// nunca se guarda. El rol y los permisos los decide el servidor en cada petición;
// lo que hay aquí solo sirve para pintar la interfaz adecuada.
//
// Usuarios registrados: localStorage (sobrevive a cerrar el navegador hasta que
// el token expira o se cierra sesión). Invitados: sessionStorage (la prueba muere
// con la pestaña).

const LLAVE = "control-iot:sesion";

let actual = leer();

function leer() {
  for (const almacen of [safe(() => sessionStorage), safe(() => localStorage)]) {
    try {
      const texto = almacen?.getItem(LLAVE);
      if (texto) {
        const datos = JSON.parse(texto);
        if (datos && typeof datos.token === "string") return datos;
      }
    } catch {
      // almacenamiento bloqueado o dato dañado: se ignora
    }
  }
  return null;
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function escribir(datos) {
  for (const almacen of [safe(() => sessionStorage), safe(() => localStorage)]) {
    try {
      almacen?.removeItem(LLAVE);
    } catch {
      // nada
    }
  }
  if (!datos) return;
  const almacen = datos.tipo === "invitado" ? safe(() => sessionStorage) : safe(() => localStorage);
  try {
    almacen?.setItem(LLAVE, JSON.stringify(datos));
  } catch {
    // sin almacenamiento la sesión vive solo en memoria
  }
}

export const sesion = {
  /** { token, tipo: "usuario"|"invitado", usuario?: {id_usuario, nombre, correo, rol}, prueba?: {...} } */
  get: () => actual,
  token: () => actual?.token || "",
  rol: () => (actual?.tipo === "invitado" ? "INVITADO" : actual?.usuario?.rol || ""),
  esInvitado: () => actual?.tipo === "invitado",
  esAdmin: () => actual?.tipo === "usuario" && actual?.usuario?.rol === "ADMIN",

  guardar(datos) {
    actual = datos;
    escribir(datos);
  },

  actualizarUsuario(usuario) {
    if (!actual) return;
    actual = { ...actual, usuario: { ...actual.usuario, ...usuario } };
    escribir(actual);
  },

  borrar() {
    actual = null;
    escribir(null);
  },
};
