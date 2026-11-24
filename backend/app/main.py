import logging
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.api.routes import graph
from app.api.routes import copilot
from app.services.graph_service import GraphService
from app.services.context_builder import ContextBuilder
from app.services.gemini_service import clear_chat_cache

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load graph into memory
    try:
        GraphService.load_graph()
    except Exception as e:
        logger.error(f"Failed to load graph during startup: {str(e)}")
    yield
    # Shutdown logic (if any)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# Compresión GZip para payloads grandes como /api/graph
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Captura global para evitar exponer stack traces o rutas internas al cliente."""
    request_id = str(uuid.uuid4())[:8]
    logger.error(
        f"[{request_id}] Excepción no controlada en {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Error interno del servidor.",
            "error_code": "INTERNAL_SERVER_ERROR",
            "request_id": request_id,
        },
    )


# Includes routers
app.include_router(graph.router, prefix=settings.API_V1_STR)
app.include_router(copilot.router, prefix=settings.API_V1_STR + "/copilot")


@app.get("/api/health")
async def health_check():
    has_graph = GraphService._cached_graph is not None
    return {"status": "ok", "graph_loaded": has_graph}


@app.post("/api/graph/reload")
async def reload_graph():
    GraphService.load_graph()
    ContextBuilder.invalidate_cache()
    clear_chat_cache()
    return {"status": "reloaded", "node_count": len(GraphService.get_graph().nodes)}
