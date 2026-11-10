// Selector de DEMO, botones Iniciar/Cancelar y avance recibido por WebSocket.
import { $, crear, nombreLegible } from "../utils/dom.js";

export function crearPanelDemo(store, controlDemo) {
  const selector = $("#sel-demo");
  const botonIniciar = $("#btn-demo-iniciar");
  const botonCancelar = $("#btn-demo-cancelar");
  const avance = $("#demo-avance");
  const barra = $("#demo-barra");
  const texto = $("#demo-texto");
  let firma = "";

  botonIniciar.addEventListener("click", () => {
    const id = Number.parseInt(selector.value, 10);
    if (Number.isInteger(id)) controlDemo.iniciar(id);
  });
  botonCancelar.addEventListener("click", () => controlDemo.cancelar());

  function construirOpciones(demos) {
    const anterior = selector.value;
    selector.replaceChildren();
    if (demos.length === 0) {
      selector.append(crear("option", { texto: "No hay DEMO guardadas", atributos: { value: "" } }));
      return;
    }
    for (const demo of demos) {
      const opcion = crear("option", { texto: `${demo.nombre} (ID ${demo.id_demo})`, atributos: { value: String(demo.id_demo) } });
      selector.append(opcion);
    }
    if ([...selector.options].some((o) => o.value === anterior)) selector.value = anterior;
  }

  function render(s) {
    const nueva = s.demos.map((d) => `${d.id_demo}:${d.nombre}`).join("|");
    if (nueva !== firma) {
      firma = nueva;
      construirOpciones(s.demos);
    }

    const activa = s.demoActiva;
    selector.disabled = Boolean(activa) || s.demos.length === 0;
    botonIniciar.disabled = Boolean(activa) || s.demos.length === 0;
    botonCancelar.disabled = !activa;
    avance.hidden = !activa;

    if (!activa) return;
    const total = activa.total ?? 0;
    const paso = activa.paso ?? 0;
    const porcentaje = total > 0 ? Math.round((paso / total) * 100) : 0;
    barra.style.width = `${porcentaje}%`;
    barra.parentElement.setAttribute("aria-valuenow", String(porcentaje));

    let linea;
    if (activa.fase === "solicitada") linea = `Solicitando «${activa.nombre}»…`;
    else if (activa.fase === "aceptada" && !activa.comando) linea = `«${activa.nombre}» aceptada por la API; esperando eventos`;
    else if (activa.comando) linea = `Paso ${paso} de ${total || "?"}: ${nombreLegible(activa.comando)}`;
    else linea = `«${activa.nombre ?? "DEMO"}» en curso`;
    texto.textContent = linea;
  }

  store.subscribe(render);
  render(store.get());
}
