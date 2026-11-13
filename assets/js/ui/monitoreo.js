// Vista MONITOREO: tarjeta del último movimiento y tabla de diez registros.
// Todo el texto que viene de la API se pinta con textContent (sin innerHTML).
import { $, crear, nombreLegible } from "../utils/dom.js";
import { aFecha, fechaCorta, horaLocal } from "../utils/fechas.js";

// Icono por comando, igual que en los botones de CONTROL
const ICONOS = {
  AVANZAR: "bi-arrow-up", RETROCEDER: "bi-arrow-down",
  GIRAR_IZQUIERDA: "bi-arrow-left", GIRAR_DERECHA: "bi-arrow-right",
  SUBIR_BRAZO: "bi-chevron-double-up", BAJAR_BRAZO: "bi-chevron-double-down",
  ABRIR_PALA: "bi-arrows-angle-expand", CERRAR_PALA: "bi-arrows-angle-contract",
  DETENER: "bi-stop-fill", ENCENDER_APAGAR: "bi-power",
  SONIDO: "bi-volume-up-fill", LUZ: "bi-lightbulb-fill",
};

export function crearVistaMonitoreo(store) {
  const tarjeta = $("#mon-tarjeta");
  const icono = $("#mon-icono");
  const movimiento = $("#mon-movimiento");
  const codigo = $("#mon-codigo");
  const fecha = $("#mon-fecha");
  const hora = $("#mon-hora");
  const nota = $("#mon-nota");
  const cuerpo = $("#mon-tabla-cuerpo");
  const estadoTabla = $("#mon-tabla-estado");
  const total = $("#mon-total");
  const vehiculo = $("#mon-vehiculo");

  let firmaHistorial = "";

  function pintarTarjeta(s) {
    const u = s.ultimoMovimiento;
    vehiculo.textContent = u?.vehiculo || s.vehiculo?.nombre || `Vehículo ${s.vehiculo?.id_vehiculo ?? ""}`;

    if (!u) {
      // Sin dato real: no se inventan movimiento ni fecha
      tarjeta.dataset.estado = s.estadoCargando ? "cargando" : (s.estadoError ? "error" : "vacio");
      icono.className = "bi bi-dash-circle";
      movimiento.textContent = s.estadoCargando ? "Cargando…" : (s.estadoError ? "Sin datos" : "Sin movimientos");
      codigo.hidden = true;
      fecha.textContent = "—";
      hora.textContent = "—";
      nota.textContent = s.estadoError
        ? `No se pudo leer el estado: ${s.estadoError}`
        : "Último estado reportado por la API. No confirma ejecución física del motor.";
      return;
    }

    const f = aFecha(u.fecha);
    tarjeta.dataset.estado = u.comando === "DETENER" ? "detenido" : "activo";
    tarjeta.dataset.origen = u.origen;
    icono.className = `bi ${ICONOS[u.comando] ?? "bi-record-circle"}`;
    movimiento.textContent = nombreLegible(u.comando);
    codigo.hidden = u.codigo === null;
    codigo.textContent = u.codigo === null ? "" : `Código ${u.codigo}`;
    fecha.textContent = fechaCorta(f);
    hora.textContent = horaLocal(f);

    const partes = [u.origen === "wss" ? "Recibido por WebSocket" : "Leído de la API (REST)"];
    if (u.esDemo) partes.push("paso de una DEMO: no entra al historial individual");
    if (s.estadoError) partes.push(`última lectura REST falló: ${s.estadoError}`);
    partes.push("último estado reportado, no ejecución física confirmada");
    nota.textContent = partes.join(" · ");
  }

  function filaMovimiento(m, indice) {
    const f = aFecha(m.fecha_hora);
    return crear("tr", {}, [
      crear("td", { clase: "mon-num", texto: String(indice + 1) }),
      crear("td", { clase: "mon-mov" }, [
        crear("i", { clase: `bi ${ICONOS[m.comando] ?? "bi-record-circle"}`, atributos: { "aria-hidden": "true" } }),
        crear("span", { texto: nombreLegible(m.comando) }),
        ...(Number.isInteger(m.codigo) ? [crear("span", { clase: "mon-cod", texto: String(m.codigo) })] : []),
      ]),
      crear("td", { texto: fechaCorta(f) }),
      crear("td", { clase: "mon-hora", texto: horaLocal(f) }),
    ]);
  }

  function pintarTabla(s) {
    const firma = s.historial.map((m) => m.id_historial).join(",") + `|${s.historialCargando}|${s.historialError}`;
    if (firma === firmaHistorial) return;
    firmaHistorial = firma;

    cuerpo.replaceChildren(...s.historial.map(filaMovimiento));

    if (s.historialError) {
      estadoTabla.textContent = `No se pudo leer el historial: ${s.historialError}`;
      estadoTabla.dataset.tipo = "error";
      estadoTabla.hidden = false;
    } else if (!s.historialListo) {
      estadoTabla.textContent = "Cargando movimientos…";
      estadoTabla.dataset.tipo = "";
      estadoTabla.hidden = false;
    } else if (s.historial.length === 0) {
      estadoTabla.textContent = "Sin movimientos registrados para este vehículo.";
      estadoTabla.dataset.tipo = "";
      estadoTabla.hidden = false;
    } else {
      estadoTabla.hidden = true;
    }

    // El número de fila es visual: quitar una fila no borra nada de Amazon RDS
    total.textContent = s.historialTotal === null
      ? `${s.historial.length} en pantalla`
      : `${s.historial.length} de ${s.historialTotal} guardados en Amazon RDS`;
  }

  function render(s) {
    pintarTarjeta(s);
    pintarTabla(s);
    cuerpo.setAttribute("aria-busy", String(s.historialCargando));
  }

  store.subscribe(render);
  render(store.get());
}
