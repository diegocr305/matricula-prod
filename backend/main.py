import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Cargamos variables de entorno (.env) antes de importar routers/servicios
load_dotenv()
load_dotenv(".env.local")

# Importamos los enrutadores que acabamos de crear
from routers import auth, dashboard, estudiantes, matriculas,reportes,documentos
from routers import establecimientos

app = FastAPI(title="API Sistema RGM - SLEP Valparaíso")

# Orígenes CORS permitidos. En producción, define CORS_ORIGINS como una lista
# separada por comas, p.ej: https://matricula.slepvalparaiso.gob.cl
# Si no se define, en desarrollo se permite todo.
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
if _cors_env:
    allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)

# Conectamos las rutas
app.include_router(auth.router)
app.include_router(estudiantes.router)
app.include_router(matriculas.router)
app.include_router(dashboard.router)
app.include_router(establecimientos.router)
app.include_router(reportes.router)
app.include_router(documentos.router)

@app.get("/")
def estado_servidor():
    return {"status": "En línea", "mensaje": "API RGM funcionando de forma modular"}