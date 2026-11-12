// Joystick circular con Pointer Events (mouse y touch) y teclado.
// Solo avisa cuando cambia la dirección efectiva; nunca por cada píxel.

// Teclas por defecto (joystick de tracción). El segundo joystick usa IJKL.
export const TECLAS_TRACCION = {
  ArrowUp: "arriba", KeyW: "arriba",
  ArrowDown: "abajo", KeyS: "abajo",
  ArrowLeft: "izquierda", KeyA: "izquierda",
  ArrowRight: "derecha", KeyD: "derecha",
};
export const TECLAS_BRAZO = {
  KeyI: "arriba", KeyK: "abajo", KeyJ: "izquierda", KeyL: "derecha",
};

/**
 * @param {HTMLElement} base       contenedor circular (debe contener .joy-perilla)
 * @param {{
 *   onDireccion: (direccion: "arriba"|"abajo"|"izquierda"|"derecha") => void,
 *   onDetener: (motivo: "centro"|"soltar") => void,
 *   onCambioVisual?: (direccion: string|null) => void,
 *   zonaMuerta?: number,
 *   teclas?: Record<string, string>,
 * }} opciones
 */
export function crearJoystick(base, { onDireccion, onDetener, onCambioVisual, zonaMuerta = 0.3, teclas = TECLAS_TRACCION }) {
  const perilla = base.querySelector(".joy-perilla");
  let habilitado = false;
  let direcciones = new Set();   // direcciones con comando en el catálogo
  let punteroId = null;
  let actual = null;             // dirección visible ahora (null = centro)
  let ultimoEmitido = null;      // última orden enviada: dirección o "detener"
  let teclaActiva = null;

  function moverPerilla(x, y) {
    perilla.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function centrar() {
    base.classList.remove("arrastrando");
    moverPerilla(0, 0);
  }

  function fijarDireccion(direccion) {
    if (direccion && !direcciones.has(direccion)) direccion = null; // dirección sin comando = centro
    if (direccion === actual) return;
    actual = direccion;
    base.dataset.direccion = direccion ?? "centro";
    onCambioVisual?.(direccion);

    if (direccion) {
      ultimoEmitido = direccion;
      onDireccion(direccion);
    } else if (ultimoEmitido && ultimoEmitido !== "detener") {
      ultimoEmitido = "detener";
      onDetener("centro");
    }
  }

  function calcular(evento) {
    const rect = base.getBoundingClientRect();
    const radio = rect.width / 2;
    let dx = evento.clientX - (rect.left + radio);
    let dy = evento.clientY - (rect.top + radio);
    const distancia = Math.hypot(dx, dy);
    const limite = radio * 0.62;
    if (distancia > limite) {
      dx = (dx / distancia) * limite;
      dy = (dy / distancia) * limite;
    }
    moverPerilla(dx, dy);

    if (distancia < radio * zonaMuerta) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "derecha" : "izquierda";
    return dy > 0 ? "abajo" : "arriba";
  }

  function soltar() {
    punteroId = null;
    teclaActiva = null;
    centrar();
    const habiaOrden = ultimoEmitido && ultimoEmitido !== "detener";
    actual = null;
    base.dataset.direccion = "centro";
    onCambioVisual?.(null);
    if (habiaOrden) {
      ultimoEmitido = "detener";
      onDetener("soltar");
    }
    ultimoEmitido = null;
  }

  base.addEventListener("pointerdown", (evento) => {
    if (!habilitado || punteroId !== null) return;
    evento.preventDefault();
    punteroId = evento.pointerId;
    base.setPointerCapture(evento.pointerId);
    base.classList.add("arrastrando");
    base.focus({ preventScroll: true });
    fijarDireccion(calcular(evento));
  });

  base.addEventListener("pointermove", (evento) => {
    if (evento.pointerId !== punteroId) return;
    fijarDireccion(calcular(evento));
  });

  const terminar = (evento) => {
    if (evento.pointerId !== punteroId) return;
    soltar();
  };
  base.addEventListener("pointerup", terminar);
  base.addEventListener("pointercancel", terminar);
  base.addEventListener("lostpointercapture", terminar);
  base.addEventListener("contextmenu", (evento) => evento.preventDefault());

  base.addEventListener("keydown", (evento) => {
    if (!habilitado) return;
    const direccion = teclas[evento.code];
    if (!direccion) return;
    evento.preventDefault();
    if (evento.repeat || teclaActiva === evento.code) return;
    teclaActiva = evento.code;
    const desplazamiento = base.getBoundingClientRect().width * 0.3;
    const vector = { arriba: [0, -1], abajo: [0, 1], izquierda: [-1, 0], derecha: [1, 0] }[direccion];
    moverPerilla(vector[0] * desplazamiento, vector[1] * desplazamiento);
    fijarDireccion(direccion);
  });

  base.addEventListener("keyup", (evento) => {
    if (evento.code === teclaActiva) soltar();
  });

  base.addEventListener("blur", () => {
    if (teclaActiva) soltar();
  });

  return {
    /** Indica qué direcciones existen en el catálogo y si el joystick acepta gestos. */
    configurar({ habilitar, disponibles }) {
      if (disponibles) direcciones = new Set(disponibles);
      const antes = habilitado;
      habilitado = Boolean(habilitar) && direcciones.size > 0;
      base.setAttribute("aria-disabled", String(!habilitado));
      base.classList.toggle("deshabilitado", !habilitado);
      // Si se deshabilita a medio gesto (por ejemplo, empieza una DEMO), vuelve al centro sin enviar nada
      if (antes && !habilitado && (punteroId !== null || teclaActiva)) {
        if (punteroId !== null && base.hasPointerCapture(punteroId)) base.releasePointerCapture(punteroId);
        punteroId = null;
        teclaActiva = null;
        ultimoEmitido = null;
        actual = null;
        base.dataset.direccion = "centro";
        onCambioVisual?.(null);
        centrar();
      }
    },
  };
}
