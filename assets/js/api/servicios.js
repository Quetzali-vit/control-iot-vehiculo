// Operaciones reales de la API. La unidad sale del contexto (vehículo
// seleccionado), no de una constante: en 4.3 cada persona trabaja con la suya.
import { RUTAS } from "../config.js";
import { vehiculoActual } from "../estado/contexto.js";
import { solicitar, ErrorApi } from "./cliente-http.js";

const ID = () => vehiculoActual();

function esLista(valor) {
  return Array.isArray(valor);
}

function exigir(condicion, mensaje) {
  if (!condicion) throw new ErrorApi("respuesta", mensaje);
}

export const servicios = {
  // =================================================================
  // Sistema
  // =================================================================
  /** GET / → {"api","estado":"Online","documentacion"} */
  async estadoServicio({ signal } = {}) {
    const { datos } = await solicitar(RUTAS.servicio(), { timeoutMs: 6000, signal, sinSesion: true });
    return datos;
  },

  /** GET /salud → {"mensaje"} (200) o 503 si Amazon RDS no responde */
  async saludRds({ signal } = {}) {
    const { datos } = await solicitar(RUTAS.salud(), { timeoutMs: 6000, signal, sinSesion: true });
    return datos;
  },

  // =================================================================
  // Sesión (4.3)
  // =================================================================
  async login(correo, contrasena) {
    const { datos } = await solicitar(RUTAS.login(), {
      metodo: "POST", cuerpo: { correo, contrasena }, sinSesion: true,
    });
    exigir(datos && typeof datos.token === "string", "La API no devolvió un token");
    return datos;
  },

  async logout() {
    await solicitar(RUTAS.logout(), { metodo: "POST" });
  },

  async yo() {
    const { datos } = await solicitar(RUTAS.yo());
    return datos;
  },

  // Autorización de soporte: el comprador deja que la empresa opere SU unidad un rato
  async autorizarSoporte(id, minutos) {
    const { datos } = await solicitar(`/mis-vehiculos/${id}/soporte`, { metodo: "POST", cuerpo: { minutos } });
    return datos;
  },

  async revocarSoporte(id) {
    const { datos } = await solicitar(`/mis-vehiculos/${id}/soporte/revocar`, { metodo: "POST" });
    return datos;
  },

  async misVehiculos() {
    const { datos } = await solicitar(RUTAS.misVehiculos());
    exigir(esLista(datos), "La lista de vehículos no es válida");
    return datos;
  },

  // =================================================================
  // Invitados (4.3)
  // =================================================================
  async catalogo() {
    const { datos } = await solicitar(RUTAS.catalogo(), { sinSesion: true });
    exigir(esLista(datos), "El catálogo no es una lista");
    return datos;
  },

  async iniciarPrueba(idModelo, nombre) {
    const { datos } = await solicitar(RUTAS.pruebas(), {
      metodo: "POST", cuerpo: { id_modelo: idModelo ?? null, nombre: nombre || null }, sinSesion: true,
    });
    exigir(datos && typeof datos.token === "string", "La API no devolvió la prueba");
    return datos;
  },

  async pruebaActual() {
    const { datos } = await solicitar(RUTAS.pruebaActual());
    return datos;
  },

  async terminarPrueba() {
    await solicitar(RUTAS.pruebaTerminar(), { metodo: "POST" });
  },

  // =================================================================
  // Vehículo seleccionado (CONTROL y MONITOREO)
  // =================================================================
  /** GET /vehiculos/{id} → datos del vehículo */
  async vehiculo() {
    const { datos } = await solicitar(RUTAS.vehiculo(ID()));
    exigir(datos && typeof datos.id_vehiculo === "number", "Respuesta de vehículo no válida");
    return datos;
  },

  /** GET /vehiculos/{id}/estado → EstadoRespuesta: último estado reportado */
  async ultimoEstado({ signal } = {}) {
    const id = ID();
    const { datos } = await solicitar(RUTAS.estado(id), { signal });
    exigir(datos && datos.id_vehiculo === id, "Respuesta de estado no válida");
    return datos;
  },

  /** GET /vehiculos/{id}/historial?limite=10 → los 10 movimientos individuales persistidos */
  async historial({ signal } = {}) {
    const id = ID();
    const { datos } = await solicitar(`${RUTAS.historial(id)}?limite=10`, { signal });
    exigir(datos && esLista(datos.movimientos), "Respuesta de historial no válida");
    const movimientos = datos.movimientos
      .filter((m) => m && Number.isInteger(m.id_historial) && m.id_vehiculo === id
        && typeof m.fecha_hora === "string")
      .sort((a, b) => b.id_historial - a.id_historial)
      .slice(0, 10);
    return {
      id_vehiculo: id,
      movimientos,
      total: Number.isInteger(datos.total_registrados) ? datos.total_registrados : null,
    };
  },

  /** GET /vehiculos/{id}/comandos → catálogo de la unidad */
  async comandos(id = ID()) {
    const { datos } = await solicitar(RUTAS.comandos(id));
    exigir(esLista(datos), "El catálogo de comandos no es una lista");
    return datos.filter((c) =>
      c && Number.isInteger(c.id_comando) && Number.isInteger(c.codigo) && typeof c.nombre === "string");
  },

  /** GET /vehiculos/{id}/demos → demos de fábrica y propias (nunca las de otra persona) */
  async demos(id = ID()) {
    const { datos } = await solicitar(RUTAS.demos(id));
    exigir(esLista(datos), "La lista de DEMO no es válida");
    return datos.filter((d) => d && Number.isInteger(d.id_demo) && typeof d.nombre === "string");
  },

  async demoEnEjecucion() {
    const { datos } = await solicitar(RUTAS.demoEjecucion(ID()));
    return datos;
  },

  /** POST /vehiculos/{id}/movimientos → 201 MovimientoRespuesta */
  async ejecutarMovimiento(codigo, _clave, { signal } = {}) {
    const { status, datos } = await solicitar(RUTAS.movimientos(ID()), {
      metodo: "POST", cuerpo: { codigo, origen: "WEB-CONTROL" }, signal,
    });
    return { status, datos };
  },

  async iniciarDemo(idDemo) {
    const { status, datos } = await solicitar(RUTAS.demoEjecutar(ID(), idDemo), { metodo: "POST" });
    return { status, datos };
  },

  async cancelarDemo() {
    const { status, datos } = await solicitar(RUTAS.demoCancelar(ID()), { metodo: "POST" });
    return { status, datos };
  },

  // ----- Editor de demos -----
  async crearDemo(id, nombre, descripcion) {
    const { datos } = await solicitar(RUTAS.demos(id), {
      metodo: "POST", cuerpo: { nombre, descripcion: descripcion || null },
    });
    return datos;
  },

  async actualizarDemo(id, idDemo, cambios) {
    const { datos } = await solicitar(`${RUTAS.demo(id, idDemo)}/actualizar`, { metodo: "POST", cuerpo: cambios });
    return datos;
  },

  async eliminarDemo(id, idDemo) {
    await solicitar(`${RUTAS.demo(id, idDemo)}/eliminar`, { metodo: "POST" });
  },

  async pasosDemo(id, idDemo) {
    const { datos } = await solicitar(RUTAS.demoPasos(id, idDemo));
    exigir(esLista(datos), "Los pasos de la DEMO no son válidos");
    return datos.sort((a, b) => a.orden - b.orden);
  },

  async agregarPaso(id, idDemo, paso) {
    const { datos } = await solicitar(RUTAS.demoPasos(id, idDemo), { metodo: "POST", cuerpo: paso });
    return datos;
  },

  async eliminarPaso(id, idDemo, idPaso) {
    await solicitar(`${RUTAS.demoPasos(id, idDemo)}/${idPaso}/eliminar`, { metodo: "POST" });
  },

  // =================================================================
  // Administración (solo ADMIN; el servidor responde 403 a cualquier otro)
  // =================================================================
  async metricas() {
    return (await solicitar(RUTAS.metricas())).datos;
  },
  async usuarios() {
    return (await solicitar(RUTAS.usuarios())).datos;
  },
  async crearUsuario(datos) {
    return (await solicitar(RUTAS.usuarios(), { metodo: "POST", cuerpo: datos })).datos;
  },
  async actualizarUsuario(id, cambios) {
    return (await solicitar(`${RUTAS.usuario(id)}/actualizar`, { metodo: "POST", cuerpo: cambios })).datos;
  },
  async modelos() {
    return (await solicitar(RUTAS.modelos())).datos;
  },
  async crearModelo(datos) {
    return (await solicitar(RUTAS.modelos(), { metodo: "POST", cuerpo: datos })).datos;
  },
  async actualizarModelo(id, cambios) {
    return (await solicitar(`${RUTAS.modelo(id)}/actualizar`, { metodo: "POST", cuerpo: cambios })).datos;
  },
  async unidades() {
    return (await solicitar(RUTAS.unidades())).datos;
  },
  async crearUnidad(datos) {
    return (await solicitar(RUTAS.unidades(), { metodo: "POST", cuerpo: datos })).datos;
  },
  async cambiarComercial(id, cambios) {
    return (await solicitar(`${RUTAS.unidad(id)}/comercial`, { metodo: "POST", cuerpo: cambios })).datos;
  },
  async asignarUnidad(id, idUsuario) {
    return (await solicitar(`${RUTAS.unidad(id)}/asignar`, { metodo: "POST", cuerpo: { id_usuario: idUsuario } })).datos;
  },
  async crearComando(id, comando) {
    return (await solicitar(RUTAS.comandos(id), { metodo: "POST", cuerpo: comando })).datos;
  },
  async auditoria(limite = 50) {
    return (await solicitar(RUTAS.auditoria(limite))).datos;
  },
  /** Alta/baja de carrito: activo false = baja lógica, conserva el historial */
  async editarUnidad(id, cambios) {
    return (await solicitar(`${RUTAS.unidad(id)}/editar`, { metodo: "POST", cuerpo: cambios })).datos;
  },
  async sesiones() {
    return (await solicitar(RUTAS.sesiones())).datos;
  },
  async cuentaCliente(idUsuario) {
    return (await solicitar(RUTAS.cuentaCliente(idUsuario))).datos;
  },
  async comandosModelo(idModelo) {
    return (await solicitar(RUTAS.modeloComandos(idModelo))).datos;
  },
  async agregarComandoModelo(idModelo, comando) {
    return (await solicitar(RUTAS.modeloComandos(idModelo), { metodo: "POST", cuerpo: comando })).datos;
  },
  async habilitarComandoModelo(idModelo, nombre, activo) {
    return (await solicitar(`${RUTAS.modeloComandos(idModelo)}/activo`, { metodo: "POST", cuerpo: { nombre, activo } })).datos;
  },
  async demoModelo(idModelo, demo) {
    return (await solicitar(RUTAS.modeloDemos(idModelo), { metodo: "POST", cuerpo: demo })).datos;
  },
};
