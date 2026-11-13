# Control IoT · Retroexcavadora

Aplicación web de **CONTROL** (práctica 4.1) y **MONITOREO** (práctica 4.2) para el vehículo IoT, en un solo sitio y un solo repositorio, con diseño de consola nocturna tipo gamepad. CONTROL tiene los tres indicadores de conexión, un panel de estado, dos joysticks táctiles (tracción a la izquierda; brazo y pala a la derecha), botones con el resto del catálogo real, un DETENER prioritario al centro, DEMO con cancelación y registro de acciones. MONITOREO muestra el último movimiento reportado y los diez movimientos individuales persistidos en Amazon RDS, actualizados en tiempo real por WebSocket. Consume la API FastAPI ya publicada en AWS (HTTPS y WSS) y se publica solo en **GitHub Pages**.

- Página publicada: `https://quetzali-vit.github.io/control-iot-vehiculo/` 
- API: `https://quetzali-iot.duckdns.org` · Swagger: `https://quetzali-iot.duckdns.org/docs`
- WebSocket: `wss://quetzali-iot.duckdns.org/ws/vehiculos/1`

> Esta etapa no conecta el ESP32. «WebSocket en línea» indica la conexión del **navegador** con el servidor, no la del vehículo físico.

## Arquitectura y flujo de datos

```
 Navegador (GitHub Pages: HTML5 + CSS3 + Bootstrap 5 + JS modules)
   │
   │  joystick / botones / DEMO ──► control/comandos.js ─┐   (un solo servicio de envío)
   │                                control/demo.js ─────┤
   │                                                     ▼
   │                                api/servicios.js → api/cliente-http.js (Fetch + async/await, timeout, errores)
   │                                                     │ HTTPS (CORS: solo el origen de GitHub Pages)
   ▼                                                     ▼
 ws/cliente-ws.js ◄── WSS ──  API FastAPI en Amazon EC2 ──► Amazon RDS (vehiculo_iot, 21 SP)
   │  eventos: estado_actual, movimiento, demo_inicio, demo_movimiento, demo_fin, demo_cancelada, demo_error, pong
   ├──────────────► monitoreo/monitor.js (4.2)
   │                  │  evento «movimiento» ──► GET /estado + GET /historial?limite=10 (persistencia confirmada)
   │                  │  eventos de DEMO ──────► solo la tarjeta; NO piden historial
   ▼                  ▼
 estado/store.js ──► ui/*.js (indicadores, botones, DEMO, registro, avisos, monitoreo)

 estado/salud.js ── GET / (servidor AWS) y GET /salud (diagnóstico de Amazon RDS) cada 20 s
```

Cada acción pasa por tres etapas que la interfaz muestra por separado: **Solicitado** → **Aceptado por API (201/202)** → **Evento WS recibido**. Ninguna de ellas confirma que el motor se haya movido.

## MONITOREO (práctica 4.2)

Segunda vista del mismo sitio, accesible desde la navegación inferior (**Control · Monitoreo · Registro**). No sustituye nada de CONTROL: reutiliza el mismo cliente REST, **la misma conexión WebSocket** y los mismos tres indicadores.

**Tarjeta de último movimiento.** Al abrir la aplicación se lee `GET /vehiculos/{id}/estado`; después cada evento WSS válido del mismo vehículo actualiza la tarjeta al instante, venga de CONTROL, de otra pestaña o de un cliente externo. La tarjeta dice de dónde vino el dato («Recibido por WebSocket» o «Leído de la API (REST)») y recuerda que es el **último estado reportado, no ejecución física confirmada**. Si no hay dato, muestra «Sin movimientos» y `—` en fecha y hora: nunca se inventan marcas temporales.

**Tabla de diez movimientos.** Sale de `GET /vehiculos/{id}/historial?limite=10`, ordenada del más reciente al más antiguo por `id_historial`. Un evento WSS **no se inserta directamente**: dispara una nueva consulta al historial confirmado (agrupando eventos seguidos en una sola petición, `MONITOREO_RESINC_MS`), así que en pantalla solo hay registros que Amazon RDS ya guardó. El número de fila es visual; que una fila salga de la pantalla no borra nada de la base de datos. El pie indica el total real (`total_registrados`).

**DEMO.** Los eventos `demo_movimiento` actualizan la tarjeta y se etiquetan como «paso de una DEMO: no entra al historial individual», pero **no** piden historial, porque el backend no los guarda como movimientos individuales. Comprobado: durante una DEMO completa la tabla no cambió.

**Orden y duplicados.** Cada petición lleva un sello creciente y se descarta la respuesta que llegue tarde, de modo que un GET viejo nunca sobrescribe información más nueva. Entre REST y WSS gana la marca temporal más reciente y, en empate, el evento WSS. Las consultas al historial nunca se solapan: si llega otro evento mientras una está en curso, se repite al terminar.

**Reconexión.** Cuando el WebSocket se recupera tras una caída, se vuelven a leer estado e historial por REST, porque pudieron perderse eventos. No hay polling del historial.

**Fechas.** El backend entrega las marcas en UTC sin sufijo de zona (`2026-11-13T04:01:46`); `utils/fechas.js` las interpreta como UTC y las muestra en la hora local del navegador. Un campo ausente se pinta `—`.

## Estructura del proyecto

```
control-iot-vehiculo/
├── index.html                 Estructura semántica, favicon, créditos al pie
├── README.md
├── .nojekyll                  GitHub Pages sirve los archivos tal cual
└── assets/
    ├── css/styles.css         Diseño de una sola pantalla (sin desplazamiento): celular, tableta y escritorio
    ├── js/
    │   ├── app.js             Arranque: crea y conecta los módulos
    │   ├── config.js          URL base, WSS, vehículo, mapeo de los joysticks, tiempos
    │   ├── api/
    │   │   ├── cliente-http.js  Fetch único: encabezados, timeout, JSON, errores HTTP/red
    │   │   └── servicios.js     Rutas reales de la API usadas por CONTROL
    │   ├── ws/cliente-ws.js   Sesión WSS real con reconexión y latido ping/pong
    │   ├── estado/
    │   │   ├── store.js       Estado de la interfaz (suscripción a cambios)
    │   │   └── salud.js       Indicadores de API AWS y Amazon RDS
    │   ├── control/
    │   │   ├── comandos.js    Coordinador de comandos: cola, duplicados, prioridad DETENER
    │   │   ├── demo.js        Iniciar, cancelar y seguir la DEMO
    │   │   └── joystick.js    Joystick con Pointer Events y teclado
    │   ├── monitoreo/
    │   │   └── monitor.js     (4.2) Carga REST, resincronización por WSS, orden y duplicados
    │   ├── ui/                Vista: indicadores, botones, DEMO, monitoreo, mensajes, clave
    │   └── utils/             DOM seguro (textContent), fechas UTC→local y mensajes de error
    ├── fonts/                 Barlow (OFL)
    ├── docs/
    │   ├── PRUEBAS.md         Casos de prueba y verificación WebSocket con Postman
    │   ├── CORS_BACKEND.md    Cómo habilitar CORS en la API
    │   └── cors-backend.patch Cambio exacto para el backend
    └── favicon.svg, favicon-32.png, apple-touch-icon.png
```

## Contrato real de la API usado

| Uso | Método y ruta | Clave | Respuesta |
|---|---|---|---|
| Salud del servidor AWS | `GET /` | No | `{"estado":"Online"}` |
| Diagnóstico de Amazon RDS | `GET /salud` | No | 200 `{"mensaje"}` o 503 |
| Vehículo | `GET /vehiculos/{id}` | No | `VehiculoDetalle` |
| Último estado (4.2) | `GET /vehiculos/{id}/estado` | No | `EstadoRespuesta` |
| Historial (4.2) | `GET /vehiculos/{id}/historial?limite=10` | No | `HistorialRespuesta` |
| Catálogo | `GET /vehiculos/{id}/comandos` | No | lista de comandos |
| DEMO guardadas | `GET /vehiculos/{id}/demos` | No | lista de DEMO |
| ¿DEMO en curso? | `GET /vehiculos/{id}/demos/ejecucion` | No | `{"en_ejecucion"}` |
| Movimiento | `POST /vehiculos/{id}/movimientos` `{"codigo","origen"}` | Sí | 201 |
| Iniciar DEMO | `POST /vehiculos/{id}/demos/{id_demo}/ejecutar` | Sí | 202 |
| Cancelar DEMO | `POST /vehiculos/{id}/demos/cancelar` | Sí | 200 |

El joystick izquierdo usa `AVANZAR`, `RETROCEDER`, `GIRAR_IZQUIERDA` y `GIRAR_DERECHA`; el derecho usa `SUBIR_BRAZO`, `BAJAR_BRAZO`, `ABRIR_PALA` y `CERRAR_PALA`, y `DETENER` es el botón central (todos se buscan por nombre en el catálogo y se configuran en `assets/js/config.js`). El resto de comandos del catálogo aparece como botones. El botón **Encender / apagar** alterna entre rojo (apagado) y verde (encendido) con una animación y un chip junto al estado; como el ESP32 también alterna, si se reinicia el vehículo la app puede quedar desfasada un toque. Solo hay un movimiento a la vez, así que mientras un joystick o un botón está en uso, los demás controles se bloquean (DETENER nunca) y se liberan al soltar, al terminar el movimiento (~2 s) o al pulsar DETENER. El botón de LUZ se oculta con `COMANDOS_OCULTOS` en `assets/js/config.js`. Cada movimiento se guarda en el historial con `origen = WEB-CONTROL`.

## Seguridad

- **La `X-API-Key` está escrita en `assets/js/config.js`** (decisión del operador para no escribirla en cada dispositivo). Como el repositorio es público, cualquiera que lea ese archivo puede controlar el vehículo: si hay abuso, cambia la clave en el backend y actualízala ahí. Si `API_KEY` se deja vacía, la página vuelve a pedirla en «Clave» (memoria y, opcionalmente, `sessionStorage` de esa pestaña).
- **CORS** se limita en el backend al origen `https://quetzali-vit.github.io` (ver `assets/docs/CORS_BACKEND.md`). CORS no es autenticación: la protección sigue siendo la clave.
- HTTPS y WSS siempre, sin contenido mixto. Bootstrap e iconos se cargan con integridad SRI.
- Los datos de la API se pintan con `textContent` (sin `innerHTML`), así que no hay inyección en el DOM.
- El navegador nunca se conecta a MySQL/RDS; RDS solo se informa a través de `GET /salud`.

## Ejecución local

Los módulos ES necesitan un servidor; no abras `index.html` con doble clic.

1. Abre la carpeta en **Visual Studio Code**.
2. Con la extensión **Live Server**, clic derecho en `index.html` → *Open with Live Server* (abre `http://127.0.0.1:5500`).
   También puedes usar la terminal: `python -m http.server 5500`.
3. Para que la API responda a `127.0.0.1:5500`, ese origen debe estar en `CORS_ORIGINS` del backend.

## Publicación en GitHub Pages

```bash
git init
git add .
git commit -m "feat: app de control IoT con joystick, DEMO e indicadores"
git branch -M main
git remote add origin https://github.com/Quetzali-vit/control-iot-vehiculo.git
git push -u origin main
```

En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. Después de 1 o 2 minutos aparece la URL `https://quetzali-vit.github.io/control-iot-vehiculo/`. El archivo `.nojekyll` evita que GitHub procese los archivos. Todas las rutas son relativas, así que funcionan en la subruta.

Commits sugeridos: estructura inicial · cliente REST · WebSocket e indicadores · joystick y botones · DEMO · estilos responsivos · README y pruebas.

## Personalización

- **Créditos:** cambia «Tu nombre completo» en el `<footer>` de `index.html`.
- **Vehículo:** `VEHICLE_ID` en `assets/js/config.js`. El nombre que aparece arriba es el que tiene en la base de datos (`GET /vehiculos/{id}`).

## Lista de verificación

- [ ] Sin claves, contraseñas ni datos de RDS en archivos públicos
- [ ] CORS del backend limitado a GitHub Pages (y localhost solo para desarrollo)
- [ ] Joystick envía un POST solo al cambiar de dirección y DETENER al soltar
- [ ] DETENER disponible siempre, también durante una DEMO (tecla Escape)
- [ ] No se pueden iniciar dos DEMO; durante la DEMO se bloquean joystick y botones
- [ ] Indicadores con texto, icono y color; RDS «Sin verificar» cuando no hay diagnóstico
- [ ] Foco visible, navegación con teclado (flechas o WASD en el joystick izquierdo, I J K L en el derecho, Escape detiene), áreas táctiles de 44 px o más
- [ ] Sin errores en la consola de DevTools en la versión publicada
- [ ] Favicon en la pestaña y créditos al pie en móvil y escritorio

## Nota sobre el ESP32

En esta práctica el vehículo físico no forma parte de la validación. Si el ESP32 está conectado con el código de la etapa anterior, cada movimiento se detiene solo a los 2 s (`DURACION_MOVIMIENTO_MS`). Para que el carrito siga mientras mantienes un joystick, pon ese valor en `0`: la app ya envía DETENER al soltar.
