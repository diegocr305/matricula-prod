from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager
from config import CORS_ORIGINS
from database import get_db_pool, close_db_pool

# Importamos los enrutadores que acabamos de crear
from routers import auth, dashboard, estudiantes, matriculas, reportes, documentos
from routers import establecimientos, asistencia

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Inicializar pool de conexiones
    get_db_pool()
    yield
    # Shutdown: Cerrar conexiones del pool de manera limpia
    close_db_pool()

app = FastAPI(title="API Sistema RGM - SLEP Valparaíso", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS, 
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
app.include_router(asistencia.router)

@app.get("/")
def estado_servidor():
    return {"status": "En línea", "mensaje": "API RGM funcionando de forma modular"}