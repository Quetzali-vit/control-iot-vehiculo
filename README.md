# Control IoT · Retroexcavadora

Aplicación web de **CONTROL** (práctica 4.1) para el vehículo IoT, con diseño de consola nocturna tipo gamepad. Tiene los tres indicadores de conexión, un panel de estado, dos joysticks táctiles (tracción a la izquierda; brazo y pala a la derecha), botones con el resto del catálogo real, un DETENER prioritario al centro, DEMO con cancelación, registro de acciones y navegación inferior. Consume la API FastAPI ya publicada en AWS (HTTPS y WSS) y se publica solo en **GitHub Pages**.

- Página publicada: `https://quetzali-vit.github.io/control-iot/` (cambia `control-iot` si tu repositorio se llama distinto)
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
   ▼
 estado/store.js ──► ui/*.js (indicadores, botones, DEMO, registro, avisos)

 estado/salud.js ── GET / (servidor AWS) y GET /salud (diagnóstico de Amazon RDS) cada 20 s
```

Cada acción pasa por tres etapas que la interfaz muestra por separado: **Solicitado** → **Aceptado por API (201/202)** → **Evento WS recibido**. Ninguna de ellas confirma que el motor se haya movido.

## Estructura del proyecto

```
control-iot/
├── index.html                 Estructura semántica, favicon, créditos al pie
├── css/styles.css             Diseño Mobile First, horizontal, tableta y escritorio
├── js/
│   ├── app.js                 Arranque: crea y conecta los módulos
│   ├── config.js              URL base, WSS, vehículo, mapeo del joystick, tiempos (sin secretos)
│   ├── api/
│   │   ├── cliente-http.js    Fetch único: encabezados, timeout, JSON, errores HTTP/red
│   │   └── servicios.js       Rutas reales de la API usadas por CONTROL
│   ├── ws/cliente-ws.js       Sesión WSS real con reconexión y latido ping/pong
│   ├── estado/
│   │   ├── store.js           Estado de la interfaz (suscripción a cambios)
│   │   └── salud.js           Indicadores de API AWS y Amazon RDS
│   ├── control/
│   │   ├── comandos.js        Coordinador de comandos: cola, duplicados, prioridad DETENER
│   │   ├── demo.js            Iniciar, cancelar y seguir la DEMO
│   │   └── joystick.js        Joystick con Pointer Events y teclado
│   ├── ui/                    Vista: indicadores, botones, DEMO, mensajes, clave
│   └── utils/                 DOM seguro (textContent) y mensajes de error
├── assets/                    favicon.svg, favicon-32.png, apple-touch-icon.png, fuentes Barlow (OFL)
└── docs/
    ├── PRUEBAS.md             Casos de prueba y verificación WebSocket con Postman
    ├── CORS_BACKEND.md        Cómo habilitar CORS en la API
    └── cors-backend.patch     Cambio exacto para el backend
```

## Contrato real de la API usado

| Uso | Método y ruta | Clave | Respuesta |
|---|---|---|---|
| Salud del servidor AWS | `GET /` | No | `{"estado":"Online"}` |
| Diagnóstico de Amazon RDS | `GET /salud` | No | 200 `{"mensaje"}` o 503 |
| Vehículo | `GET /vehiculos/{id}` | No | `VehiculoDetalle` |
| Catálogo | `GET /vehiculos/{id}/comandos` | No | lista de comandos |
| DEMO guardadas | `GET /vehiculos/{id}/demos` | No | lista de DEMO |
| ¿DEMO en curso? | `GET /vehiculos/{id}/demos/ejecucion` | No | `{"en_ejecucion"}` |
| Movimiento | `POST /vehiculos/{id}/movimientos` `{"codigo","origen"}` | Sí | 201 |
| Iniciar DEMO | `POST /vehiculos/{id}/demos/{id_demo}/ejecutar` | Sí | 202 |
| Cancelar DEMO | `POST /vehiculos/{id}/demos/cancelar` | Sí | 200 |

El joystick izquierdo usa `AVANZAR`, `RETROCEDER`, `GIRAR_IZQUIERDA` y `GIRAR_DERECHA`; el derecho usa `SUBIR_BRAZO`, `BAJAR_BRAZO`, `ABRIR_PALA` y `CERRAR_PALA`, y `DETENER` es el botón central (todos se buscan por nombre en el catálogo y se configuran en `js/config.js`). El resto de comandos del catálogo aparece como botones. Solo hay un movimiento a la vez, así que mientras un joystick o un botón está en uso, los demás controles se bloquean (DETENER nunca) y se liberan al soltar, al terminar el movimiento (~2 s) o al pulsar DETENER. El botón de LUZ se oculta con `COMANDOS_OCULTOS` en `js/config.js`. Cada movimiento se guarda en el historial con `origen = WEB-CONTROL`.

## Seguridad

- **No hay secretos en el repositorio.** La `X-API-Key` la escribe el operador en «Clave». Vive en memoria y, si se marca la casilla, en `sessionStorage` de esa pestaña; se borra al cerrarla.
- **CORS** se limita en el backend al origen `https://quetzali-vit.github.io` (ver `docs/CORS_BACKEND.md`). CORS no es autenticación: la protección sigue siendo la clave.
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
git remote add origin https://github.com/Quetzali-vit/control-iot.git
git push -u origin main
```

En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. Después de 1 o 2 minutos aparece la URL `https://quetzali-vit.github.io/control-iot/`. El archivo `.nojekyll` evita que GitHub procese los archivos. Todas las rutas son relativas, así que funcionan en la subruta.

Commits sugeridos: estructura inicial · cliente REST · WebSocket e indicadores · joystick y botones · DEMO · estilos responsivos · README y pruebas.

## Personalización

- **Créditos:** cambia «Tu nombre completo» en el `<footer>` de `index.html`.
- **Vehículo:** `VEHICLE_ID` en `js/config.js`. El nombre que aparece arriba es el que tiene en la base de datos (`GET /vehiculos/{id}`).

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
