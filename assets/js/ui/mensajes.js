// Mensajes de acción: aviso breve, última acción, registro y último evento WebSocket.
import { $, crear, hora, nombreLegible } from "../utils/dom.js";

const FASES = {
  en_cola: "En cola",
  solicitado: "Solicitado",
  aceptado: "Aceptado por API",
  superado: "Superado por DETENER",
  descartado: "Descartado",
  error: "Error",
};

const FUENTES = { joystick: "joystick", boton: "botón", detener: "botón DETENER", teclado: "teclado", respaldo: "respaldo automático" };

export function crearMensajes(store) {
  const aviso = $("#aviso");
  const lista = $("#registro");
  const vacio = $("#registro-vacio");
  const ultimoEvento = $("#ultimo-evento");
  let temporizadorAviso = null;

  function avisar(mensaje, tipo = "aviso") {
    clearTimeout(temporizadorAviso);
    aviso.textContent = mensaje;
    aviso.dataset.tipo = tipo;
    aviso.hidden = false;
    temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, tipo === "error" ? 7000 : 4500);
  }

  function filaAccion(r) {
    const etapas = crear("span", { clase: "registro-etapas" });
    etapas.append(crear("span", { clase: `etapa etapa-${r.fase}`, texto: r.http ? `${FASES[r.fase]} (${r.http})` : FASES[r.fase] }));
    if (r.ws) etapas.append(crear("span", { clase: "etapa etapa-ws", texto: `Evento WS ${hora(r.wsHora)}` }));
    return crear("li", { clase: "registro-fila", atributos: { "data-fase": r.fase } }, [
      crear("span", { clase: "registro-comando" }, [
        crear("span", { texto: nombreLegible(r.nombre) }),
        crear("span", { clase: "registro-codigo", texto: String(r.codigo), atributos: { title: "Código" } }),
      ]),
      crear("span", { clase: "registro-meta", texto: `${hora(r.hora)}, desde ${FUENTES[r.fuente] ?? r.fuente}` }),
      etapas,
      ...(r.mensaje ? [crear("span", { clase: "registro-error", texto: r.mensaje })] : []),
    ]);
  }

  let ultimaFirma = "";
  function render(s) {
    const firma = JSON.stringify(s.acciones) + JSON.stringify(s.ultimoEvento);
    if (firma === ultimaFirma) return;
    ultimaFirma = firma;

    vacio.hidden = s.acciones.length > 0;
    lista.replaceChildren(...s.acciones.map(filaAccion));

    const ev = s.ultimoEvento;
    if (!ev) {
      ultimoEvento.textContent = "Aún no llegan eventos por WebSocket.";
    } else {
      const comando = ev.comando ? ` ${ev.comando} (código ${ev.codigo})` : "";
      ultimoEvento.textContent =
        `Último evento WS: «${ev.evento}»${comando}, vehículo ${ev.id_vehiculo}, ${hora(ev.timestamp)}`;
    }
  }

  store.subscribe(render);
  render(store.get());

  return { avisar };
}
