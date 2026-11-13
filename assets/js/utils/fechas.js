// Fechas del backend. Amazon RDS guarda las marcas en UTC sin sufijo de zona
// (por ejemplo "2026-11-13T04:01:46"); los eventos WSS sí traen zona explícita.
// Aquí se normalizan y se muestran en la hora local del navegador, sin fabricar
// marcas temporales: si el dato no existe, se devuelve null y se pinta "—".

/** Convierte una marca del backend a Date, o null si no existe o no es válida. */
export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  // Con zona explícita (Z o ±hh:mm) se respeta; sin ella se interpreta como UTC,
  // que es como la guarda el backend (documentado en el README).
  const tieneZona = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto);
  const fecha = new Date(tieneZona ? texto : `${texto}Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** "13/11/2026" en hora local, o "—" si no hay dato. */
export function fechaCorta(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "22:01:46" en hora local, o "—" si no hay dato. */
export function horaLocal(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
