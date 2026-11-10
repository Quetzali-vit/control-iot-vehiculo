// Panel de conectividad: tres indicadores independientes (texto + icono + color).
import { $ } from "../utils/dom.js";

const PRESENTACION = {
  ws: {
    en_linea: { texto: "En línea", icono: "bi-broadcast", tono: "ok" },
    conectando: { texto: "Conectando", icono: "bi-arrow-repeat", tono: "espera" },
    reconectando: { texto: "Reconectando", icono: "bi-arrow-repeat", tono: "espera" },
    desconectado: { texto: "Desconectado", icono: "bi-x-octagon", tono: "falla" },
  },
  api: {
    disponible: { texto: "Disponible", icono: "bi-cloud-check", tono: "ok" },
    comprobando: { texto: "Comprobando", icono: "bi-arrow-repeat", tono: "espera" },
    no_disponible: { texto: "No disponible", icono: "bi-cloud-slash", tono: "falla" },
  },
  rds: {
    disponible: { texto: "Disponible", icono: "bi-database-check", tono: "ok" },
    no_disponible: { texto: "No disponible", icono: "bi-database-x", tono: "falla" },
    sin_verificar: { texto: "Sin verificar", icono: "bi-database-dash", tono: "neutro" },
  },
};

export function crearIndicadores(store, { onReconectarWs, onComprobarApi }) {
  const elementos = {
    ws: $("#ind-ws"),
    api: $("#ind-api"),
    rds: $("#ind-rds"),
  };

  $("#ind-ws-accion").addEventListener("click", onReconectarWs);
  $("#ind-api-accion").addEventListener("click", onComprobarApi);

  function pintar(clave, estado, detalle) {
    const el = elementos[clave];
    const info = PRESENTACION[clave][estado] ?? PRESENTACION[clave][Object.keys(PRESENTACION[clave])[0]];
    if (el.dataset.estado === estado && el.dataset.detalle === detalle) return;
    el.dataset.estado = estado;
    el.dataset.detalle = detalle;
    el.dataset.tono = info.tono;
    el.querySelector(".ind-icono").className = `ind-icono bi ${info.icono}`;
    el.querySelector(".ind-valor").textContent = info.texto;
    el.querySelector(".ind-detalle").textContent = detalle || "";
  }

  function render(s) {
    pintar("ws", s.ws, s.wsDetalle);
    pintar("api", s.api, s.apiDetalle);
    pintar("rds", s.rds, s.rdsDetalle);
    $("#ind-ws-accion").hidden = s.ws !== "desconectado";
    $("#ind-api-accion").hidden = s.api !== "no_disponible";
  }

  store.subscribe(render);
  render(store.get());
}
