import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import graph
from app.api.routes import copilot
from app.services.graph_service import GraphService

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
    pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Includes routers
app.include_router(graph.router, prefix=settings.API_V1_STR)
app.include_router(copilot.router, prefix=settings.API_V1_STR + "/copilot")

@app.get("/api/health")
async def health_check():
    has_graph = GraphService._cached_graph is not None
    return {"status": "ok", "graph_loaded": has_graph}