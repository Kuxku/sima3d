from typing import Dict, Any, List, Optional, Callable
import logging
from pydantic import BaseModel, Field, ValidationError
from google.genai import types
from app.services.graph_service import GraphService

logger = logging.getLogger(__name__)

# --- DTOs de Argumentos ---

class FocusNodeArgs(BaseModel):
    node_id: str = Field(description="ID exacto del nodo en el grafo (ej: comuna-robledo, fac-ingenieria, etc.)")

class ResetViewArgs(BaseModel):
    pass

class HighlightNodesArgs(BaseModel):
    node_ids: List[str] = Field(description="Lista de IDs de nodos a resaltar simultáneamente")

class FilterByTypeArgs(BaseModel):
    node_type: str = Field(description="Tipo de nodo a filtrar o resaltar: 'comuna', 'colegio', 'facultad' o 'all'")

class InspectNodeArgs(BaseModel):
    node_id: str = Field(description="ID del nodo cuyas métricas completas se desean consultar")


# --- Resultado de Ejecución de Acción ---

class ActionResult(BaseModel):
    success: bool
    action: str
    args: Dict[str, Any] = Field(default_factory=dict)
    data: Optional[Dict[str, Any]] = None
    confirmation: str
    camera_command: Optional[Dict[str, Any]] = None
    highlighted_node_ids: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class ActionDefinition:
    def __init__(
        self,
        name: str,
        description: str,
        args_schema: type[BaseModel],
        parameters_dict: Dict[str, Any],
        handler: Callable[[Dict[str, Any]], ActionResult],
        confirmation_builder: Callable[[Dict[str, Any], Optional[Dict[str, Any]]], str]
    ):
        self.name = name
        self.description = description
        self.args_schema = args_schema
        self.parameters_dict = parameters_dict
        self.handler = handler
        self.confirmation_builder = confirmation_builder

    def to_function_declaration(self) -> types.FunctionDeclaration:
        return types.FunctionDeclaration(
            name=self.name,
            description=self.description,
            parameters=self.parameters_dict
        )


# --- Implementación Centralizada del Registro ---

class ActionRegistry:
    def __init__(self):
        self._actions: Dict[str, ActionDefinition] = {}
        self._register_default_actions()

    def register(self, action: ActionDefinition):
        self._actions[action.name] = action

    def get_action(self, name: str) -> Optional[ActionDefinition]:
        return self._actions.get(name)

    def get_function_declarations(self) -> List[types.FunctionDeclaration]:
        return [act.to_function_declaration() for act in self._actions.values()]

    def get_gemini_tools(self) -> List[types.Tool]:
        return [types.Tool(function_declarations=self.get_function_declarations())]

    def execute(self, action_name: str, raw_args: Dict[str, Any]) -> ActionResult:
        """
        Ejecuta una acción validando el nombre, esquema de argumentos,
        y contrastando IDs contra la topología en memoria de SIMA-3D.
        """
        action = self.get_action(action_name)
        if not action:
            msg = f"Acción '{action_name}' no autorizada o no implementada en el sistema."
            logger.warning(msg)
            return ActionResult(
                success=False,
                action=action_name,
                args=raw_args,
                confirmation=msg,
                error="ACTION_NOT_FOUND"
            )

        # Validación estricta con Pydantic
        try:
            validated = action.args_schema(**raw_args)
            validated_dict = validated.model_dump()
        except ValidationError as val_err:
            msg = f"Parámetros inválidos para la acción '{action_name}': {val_err.errors()}"
            logger.warning(msg)
            return ActionResult(
                success=False,
                action=action_name,
                args=raw_args,
                confirmation="Los parámetros de la acción no cumplen el formato requerido.",
                error="VALIDATION_ERROR"
            )

        try:
            return action.handler(validated_dict)
        except Exception as e:
            logger.error(f"Error ejecutando handler de '{action_name}': {e}", exc_info=True)
            return ActionResult(
                success=False,
                action=action_name,
                args=validated_dict,
                confirmation=f"Ocurrió un error al ejecutar la acción {action_name}.",
                error=str(e)
            )

    def _register_default_actions(self):
        # 1. focus_node
        self.register(ActionDefinition(
            name="focus_node",
            description="Enfoca la cámara 3D en un nodo específico y despliega su ficha técnica institucional.",
            args_schema=FocusNodeArgs,
            parameters_dict={
                "type": "OBJECT",
                "properties": {
                    "node_id": {
                        "type": "STRING",
                        "description": "ID del nodo (ej: fac-ingenieria, comuna-belen, col-cefa)"
                    }
                },
                "required": ["node_id"]
            },
            handler=self._handle_focus_node,
            confirmation_builder=lambda args, data: f"Enfocando {data.get('label', args.get('node_id'))} en el lienzo 3D." if data else f"Nodo {args.get('node_id')} enfocado."
        ))

        # 2. reset_view
        self.register(ActionDefinition(
            name="reset_view",
            description="Restablece la cámara 3D a la vista orbital panorámica y deselecciona cualquier nodo.",
            args_schema=ResetViewArgs,
            parameters_dict={
                "type": "OBJECT",
                "properties": {}
            },
            handler=self._handle_reset_view,
            confirmation_builder=lambda args, data: "Vista orbital panorámica restablecida."
        ))

        # 3. highlight_nodes
        self.register(ActionDefinition(
            name="highlight_nodes",
            description="Resalta un conjunto de nodos en el grafo 3D y atenúa los nodos no relacionados.",
            args_schema=HighlightNodesArgs,
            parameters_dict={
                "type": "OBJECT",
                "properties": {
                    "node_ids": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": "Lista de IDs de nodos válidos a resaltar"
                    }
                },
                "required": ["node_ids"]
            },
            handler=self._handle_highlight_nodes,
            confirmation_builder=lambda args, data: f"Se han resaltado {len(data.get('valid_ids', []))} nodos destacados en la red." if data else "Nodos resaltados."
        ))

        # 4. filter_by_type
        self.register(ActionDefinition(
            name="filter_by_type",
            description="Filtra y resalta todos los nodos de un tipo de entidad: 'comuna', 'colegio', 'facultad' o 'all'.",
            args_schema=FilterByTypeArgs,
            parameters_dict={
                "type": "OBJECT",
                "properties": {
                    "node_type": {
                        "type": "STRING",
                        "description": "Tipo de entidad: comuna, colegio, facultad o all",
                        "enum": ["comuna", "colegio", "facultad", "all"]
                    }
                },
                "required": ["node_type"]
            },
            handler=self._handle_filter_by_type,
            confirmation_builder=lambda args, data: f"Filtrando la red por la categoría {args.get('node_type')} ({data.get('count', 0)} nodos)." if data else f"Filtro aplicado: {args.get('node_type')}."
        ))

        # 5. inspect_node
        self.register(ActionDefinition(
            name="inspect_node",
            description="Obtiene las métricas institucionales detalladas de un nodo (volumen, estrato mediano, ruralidad, grado).",
            args_schema=InspectNodeArgs,
            parameters_dict={
                "type": "OBJECT",
                "properties": {
                    "node_id": {
                        "type": "STRING",
                        "description": "ID del nodo a inspeccionar"
                    }
                },
                "required": ["node_id"]
            },
            handler=self._handle_inspect_node,
            confirmation_builder=lambda args, data: f"Ficha analítica de {data.get('label', '')} cargada con {data.get('metrics', {}).get('volume', 0)} estudiantes." if data else "Métricas cargadas."
        ))

    # --- Handlers Reales ---

    def _find_node(self, target_id: str):
        graph = GraphService.get_graph()
        if not target_id:
            return None
        # 1. Búsqueda exacta por ID
        node = next((n for n in graph.nodes if n.id == target_id), None)
        if node:
            return node
        
        # 2. Normalización de formato (cambio entre '-' y ':')
        norm_id = target_id.lower().strip().replace(" ", "-")
        node = next((n for n in graph.nodes if n.id.lower() == norm_id or n.id.lower().replace(":", "-") == norm_id.replace(":", "-")), None)
        if node:
            return node

        # 3. Búsqueda por coincidencia de subcadena en ID o label
        clean_target = norm_id.replace("comuna:", "").replace("facultad:", "").replace("colegio:", "").replace("comuna-", "").replace("facultad-", "").replace("col-", "")
        for n in graph.nodes:
            clean_node_id = n.id.lower().replace("comuna:", "").replace("facultad:", "").replace("colegio:", "")
            if clean_target in clean_node_id or clean_target in n.label.lower():
                return n

        return None

    def _handle_focus_node(self, args: Dict[str, Any]) -> ActionResult:
        graph = GraphService.get_graph()
        target_id = args["node_id"]
        node = self._find_node(target_id)

        if not node:
            return ActionResult(
                success=False,
                action="focus_node",
                args=args,
                confirmation=f"No se encontró el nodo '{target_id}' en el grafo institucional.",
                error="NODE_NOT_FOUND"
            )

        data = {
            "id": node.id,
            "label": node.label,
            "type": node.type,
            "cluster": node.cluster,
            "metrics": node.metrics.model_dump(),
            "position": node.position.model_dump()
        }

        # Conexiones directas para resaltado contextual
        connected_ids = [
            e.target if e.source == node.id else e.source
            for e in graph.edges
            if e.source == node.id or e.target == node.id
        ]
        all_highlighted = [node.id] + connected_ids

        return ActionResult(
            success=True,
            action="focus_node",
            args={"node_id": node.id},
            data=data,
            confirmation=f"Enfocando {node.label} ({node.type.capitalize()}) con {node.metrics.volume:,} estudiantes matriculados.",
            camera_command={
                "action": "focus_node",
                "target_node_id": node.id,
                "cluster_id": node.cluster
            },
            highlighted_node_ids=all_highlighted
        )

    def _handle_reset_view(self, args: Dict[str, Any]) -> ActionResult:
        return ActionResult(
            success=True,
            action="reset_view",
            args=args,
            data={"status": "reset"},
            confirmation="Vista orbital panorámica restablecida. Todos los filtros fueron limpiados.",
            camera_command={
                "action": "reset_view",
                "target_node_id": None,
                "cluster_id": None
            },
            highlighted_node_ids=[]
        )

    def _handle_highlight_nodes(self, args: Dict[str, Any]) -> ActionResult:
        graph = GraphService.get_graph()
        req_ids = args.get("node_ids", [])
        valid_nodes = [n for n in graph.nodes if n.id in req_ids]
        valid_ids = [n.id for n in valid_nodes]

        if not valid_ids:
            return ActionResult(
                success=False,
                action="highlight_nodes",
                args=args,
                confirmation="Ninguno de los IDs solicitados existe en la red actual.",
                error="NO_VALID_NODES"
            )

        lead_node = valid_nodes[0]
        return ActionResult(
            success=True,
            action="highlight_nodes",
            args={"node_ids": valid_ids},
            data={"valid_ids": valid_ids, "count": len(valid_ids)},
            confirmation=f"Resaltando {len(valid_ids)} nodos clave en la red.",
            camera_command={
                "action": "focus_node",
                "target_node_id": lead_node.id,
                "cluster_id": lead_node.cluster
            },
            highlighted_node_ids=valid_ids
        )

    def _handle_filter_by_type(self, args: Dict[str, Any]) -> ActionResult:
        graph = GraphService.get_graph()
        ntype = args.get("node_type", "all").lower()

        if ntype == "all":
            return self._handle_reset_view({})

        matched_nodes = [n for n in graph.nodes if n.type == ntype]
        matched_ids = [n.id for n in matched_nodes]

        lead_node = matched_nodes[0] if matched_nodes else None
        return ActionResult(
            success=True,
            action="filter_by_type",
            args={"node_type": ntype},
            data={"node_type": ntype, "count": len(matched_ids), "ids": matched_ids},
            confirmation=f"Filtrando la visualización por {ntype}s ({len(matched_ids)} entidades activas).",
            camera_command={
                "action": "focus_node",
                "target_node_id": lead_node.id if lead_node else None,
                "cluster_id": None
            } if lead_node else None,
            highlighted_node_ids=matched_ids
        )

    def _handle_inspect_node(self, args: Dict[str, Any]) -> ActionResult:
        graph = GraphService.get_graph()
        target_id = args.get("node_id", "")
        node = self._find_node(target_id)

        if not node:
            return ActionResult(
                success=False,
                action="inspect_node",
                args=args,
                confirmation=f"No se encontró el nodo '{target_id}'.",
                error="NODE_NOT_FOUND"
            )

        connections = [
            {"peer": e.target if e.source == node.id else e.source, "weight": e.weight}
            for e in graph.edges
            if e.source == node.id or e.target == node.id
        ]
        connections.sort(key=lambda x: x["weight"], reverse=True)

        data = {
            "id": node.id,
            "label": node.label,
            "type": node.type,
            "metrics": node.metrics.model_dump(),
            "top_connections": connections[:5]
        }

        rural_pct = f"{round((node.metrics.rural_share or 0) * 100, 1)}%"
        estrato = f"Estrato mediano {node.metrics.estrato_median}" if node.metrics.estrato_median else "Sin estrato urbano"
        confirmation = (
            f"Ficha de {node.label}: {node.metrics.volume:,} estudiantes matriculados, "
            f"{estrato}, ruralidad del {rural_pct}. Grado de conectividad: {node.metrics.degree} enlaces."
        )

        return ActionResult(
            success=True,
            action="inspect_node",
            args={"node_id": node.id},
            data=data,
            confirmation=confirmation,
            camera_command={
                "action": "focus_node",
                "target_node_id": node.id,
                "cluster_id": node.cluster
            },
            highlighted_node_ids=[node.id] + [c["peer"] for c in connections[:5]]
        )

# Instancia singleton del registro
action_registry = ActionRegistry()
