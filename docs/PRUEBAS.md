# Pruebas funcionales y evidencias

Haz las pruebas en la **versión publicada** de GitHub Pages, desde un teléfono real y desde una computadora.

## Preparar el cliente WebSocket independiente (Postman)

1. En Postman: **New → WebSocket**.
2. URL: `wss://quetzali-iot.duckdns.org/ws/vehiculos/1` → **Connect**.
3. Debe llegar `estado_actual` con el último estado guardado.
4. Escribe `ping` y pulsa **Send**: debe llegar `{"evento":"pong",...}`.

Esta sesión de Postman es **independiente** de la sesión WSS que abre la página. Las dos reciben los mismos eventos.

## Prueba A · Movimiento individual (Evidencia 3)

1. En el teléfono, abre la página, pulsa **Clave**, escribe tu X-API-Key y pulsa **Usar clave**.
2. Empuja el joystick hacia **Avanzar**.
3. Comprueba:
   - **DevTools → Network** (en la computadora): `POST /vehiculos/1/movimientos` con respuesta **201**.
   - **Postman**: `{"evento":"movimiento","id_vehiculo":1,"comando":"AVANZAR","codigo":1,...,"timestamp":"..."}`.
   - **Página**: en «Registro» aparecen las etapas *Aceptado por API (201)* y *Evento WS hh:mm:ss*.
4. Relaciona vehículo, comando, código y `timestamp` entre la página y Postman.

## Prueba B · Cambio de dirección y DETENER (Evidencia 4)

1. Sin soltar, mueve el joystick de **Avanzar** a **Girar derecha** y luego suéltalo.
2. Deben salir exactamente tres POST: `1`, `4` y `9`. Arrastrar dentro de la misma dirección no genera más.
3. En Postman llegan tres eventos `movimiento` en el mismo orden.
4. Pulsa el botón rojo **Detener**: sale de inmediato, aunque haya otro comando en camino.

## Prueba C · DEMO (Evidencia 5)

1. En «DEMO» elige una secuencia (por ejemplo, *Demo completa (ID 5)*) y pulsa **Iniciar DEMO** → respuesta **202**.
2. En Postman: `demo_inicio`, después un `demo_movimiento` por paso (`orden`, `duracion_ms`, `pausa_ms`) y al final `demo_fin`.
3. Mientras corre: **Iniciar DEMO**, el joystick y los botones se bloquean; **Detener** y **Cancelar DEMO** siguen activos.
4. Repite y pulsa **Cancelar DEMO** a la mitad → `POST /demos/cancelar` (200) y evento `demo_cancelada`.
5. Consulta `GET /vehiculos/1/historial` en Swagger: los pasos de la DEMO **no** aparecen; los movimientos individuales sí (origen `WEB-CONTROL`).

## Prueba D · Indicadores y recuperación (Evidencia 6)

| Situación | WebSocket WSS | Servidor AWS | Amazon RDS |
|---|---|---|---|
| Todo funcionando | En línea | Disponible | Disponible |
| Activa el modo avión del teléfono unos segundos | Desconectado → Reconectando | No disponible | Sin verificar |
| Quita el modo avión | En línea | Disponible | Disponible |
| Si `GET /salud` respondiera 503 | En línea | Disponible | No disponible |

- El indicador WSS cambia con los eventos reales `open`, `close` y la reconexión (espera creciente de 1 a 15 s). También se puede pulsar **Reconectar**.
- La API se comprueba cada 20 s con `GET /` (cada 10 s si falló). RDS solo se marca **Disponible** con la respuesta del diagnóstico `GET /salud`.
- Si la API no responde, RDS queda en **Sin verificar**: no se culpa a la base de datos sin evidencia.

## Prueba E · Responsividad (Evidencias 2 y 7)

- Teléfono vertical: indicadores y estado arriba, DETENER grande, los dos joysticks lado a lado, botones y DEMO debajo, y la barra de navegación (Control, Registro, Clave) fija abajo.
- Teléfono horizontal: distribución de gamepad, con la tracción a la izquierda, brazo y pala a la derecha y DETENER y botones al centro.
- Tableta y escritorio: el control aparece como dispositivo centrado y el registro de acciones va debajo.
- En todos: sin desplazamiento lateral y áreas táctiles de 44 px o más.
- Favicon en la pestaña y «Desarrollado por …» al pie.

## Pruebas de errores

| Acción | Resultado esperado |
|---|---|
| Mover sin escribir la clave | No se envía nada; se abre «Clave» |
| Clave incorrecta | Aviso «La clave de control no es válida» y se pide otra |
| Iniciar DEMO con otra en curso | La API responde 409; la página lo explica y se sincroniza |
| API caída o sin internet | Aviso de conexión; los indicadores cambian; la interfaz no se congela |

## Qué confirma cada evidencia

- **HTTP 201/202**: la API aceptó la solicitud y la guardó.
- **Evento WebSocket**: el backend publicó el evento.
- **Ninguna de las dos** confirma la ejecución física en motores; eso corresponde a una etapa posterior con el ESP32.
