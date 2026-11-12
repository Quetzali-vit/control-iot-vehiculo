# Habilitar CORS en la API (backend)

Sin CORS, el navegador bloquea las peticiones que la página de GitHub Pages hace a `https://quetzali-iot.duckdns.org`. La práctica lo permite como corrección indispensable (puntos 10.2 y 13.5).

El cambio exacto está en `cors-backend.patch`. Toca tres archivos del repositorio `api_vehiculo_iot_2_6`:

**`app/core/config.py`**: nueva variable con los orígenes permitidos.

```python
    cors_origins: str = Field(
        default="https://quetzali-vit.github.io",
        description="Ejemplo: https://quetzali-vit.github.io,http://127.0.0.1:5500",
    )

    @property
    def lista_cors(self) -> list[str]:
        return [origen.strip().rstrip("/") for origen in self.cors_origins.split(",") if origen.strip()]
```

**`app/main.py`**: middleware justo después de crear `app`.

```python
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().lista_cors,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
    allow_credentials=False,
    max_age=600,
)
```

**`.env`** del servidor (y `.env.example` sin secretos):

```
CORS_ORIGINS=https://quetzali-vit.github.io,http://127.0.0.1:5500,http://localhost:5500
```

El origen de GitHub Pages es solo `https://quetzali-vit.github.io`, sin la subruta del repositorio.

## Aplicarlo

1. En tu computadora, dentro del repositorio de la API: `git apply ruta/a/assets/docs/cors-backend.patch`, después `git commit` y `git push`.
2. En la instancia EC2: actualiza el código (`git pull`), agrega `CORS_ORIGINS` al `.env` y reinicia la API (el servicio o el proceso de `uvicorn` que uses).
3. Comprueba desde cualquier terminal:

```bash
curl -i -X OPTIONS https://quetzali-iot.duckdns.org/vehiculos/1/movimientos \
  -H "Origin: https://quetzali-vit.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-api-key"
```

Debe responder `200` con `access-control-allow-origin: https://quetzali-vit.github.io`. Un origen distinto recibe `400` y no aparece ese encabezado.

El WebSocket no necesita CORS. Swagger sigue funcionando igual porque se sirve desde el mismo dominio.
