// Traduce errores técnicos a mensajes claros para el operador (sin trazas internas).

export function mensajeDeError(error) {
  if (!error) return "Ocurrió un error desconocido";
  if (error.name !== "ErrorApi") return "Ocurrió un error inesperado en la página";

  switch (error.tipo) {
    case "red":
      return "No hay conexión con la API. Revisa tu internet; si persiste, revisa el CORS del servidor.";
    case "timeout":
      return "La API tardó demasiado en responder. Intenta de nuevo.";
    case "cancelado":
      return "La solicitud se canceló.";
    case "respuesta":
      return "La API respondió con datos que no se pueden leer.";
    default:
      break;
  }

  switch (error.status) {
    case 401:
      return "Falta la clave de control. Escríbela en «Clave».";
    case 403:
      return "La clave de control no es válida. Escríbela de nuevo.";
    case 404:
      return error.detalle || "El recurso no existe en la API.";
    case 409:
      return error.detalle || "La acción choca con el estado actual del vehículo.";
    case 422:
      return error.detalle ? `Solicitud rechazada: ${error.detalle}` : "La solicitud tiene datos no válidos.";
    case 503:
      return "La base de datos Amazon RDS no responde (503).";
    default:
      return error.detalle || `La API respondió con error ${error.status}.`;
  }
}
