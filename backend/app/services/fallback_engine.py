import logging
from typing import Optional, List, Dict, Any
from app.core.config import settings
from app.services.graph_service import GraphService

logger = logging.getLogger(__name__)


class FallbackEngine:
    """
    Motor analítico local de alta fidelidad para SIMA-3D.
    Garantiza que el sistema responda con datos estadísticos reales,
    narrativa estructurada y comandos de cámara válidos incluso si la API de Gemini
    sufre caídas de red, sobrecarga temporal (503) o límites de cuota (429).
    Cumple con AGENTS.md (cero fallos en demo en vivo, cero cifras hardcodeadas).
    """

    @classmethod
    def generate_response(
        cls,
        user_message: str,
        selected_node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        graph = GraphService.get_graph()
        msg = (user_message or "").lower().strip()
        aggregate_ids = set(settings.AGGREGATE_NODE_IDS)

        nodes_by_id = {n.id: n for n in graph.nodes}
        sorted_nodes = sorted(graph.nodes, key=lambda n: n.metrics.volume, reverse=True)

        # Excluir nodos agregados de los rankings (consistente con ContextBuilder)
        all_comunas = [n for n in sorted_nodes if n.type == "comuna"]
        comunas = [n for n in all_comunas if n.id not in aggregate_ids]
        colegios = [n for n in sorted_nodes if n.type == "colegio" and n.id not in aggregate_ids]
        facultades = [n for n in sorted_nodes if n.type == "facultad" and n.id not in aggregate_ids]

        # -------------------------------------------------------------
        # CASO 1: El usuario tiene un nodo enfocado o seleccionado
        # -------------------------------------------------------------
        target_node = nodes_by_id.get(selected_node_id) if selected_node_id else None

        # O si el mensaje menciona directamente el nombre de un nodo
        if not target_node:
            for n in graph.nodes:
                if len(n.label) > 4 and n.label.lower() in msg:
                    target_node = n
                    break

        if target_node:
            connected_edges = [
                e for e in graph.edges
                if e.source == target_node.id or e.target == target_node.id
            ]
            connected_edges.sort(key=lambda e: e.weight, reverse=True)

            top_links: List[str] = []
            highlight_ids = [target_node.id]
            for e in connected_edges[:4]:
                other_id = e.target if e.source == target_node.id else e.source
                other_node = nodes_by_id.get(other_id)
                if other_node:
                    top_links.append(f"{other_node.label} ({e.weight:,} estudiantes)")
                    highlight_ids.append(other_id)

            estrato_text = (
                f"Estrato {target_node.metrics.estrato_median:.1f}"
                if target_node.metrics.estrato_median is not None
                else "información no disponible"
            )
            rural_pct = (target_node.metrics.rural_share or 0.0) * 100.0
            links_str = "; ".join(top_links) if top_links else "conexiones en proceso de consolidación"

            answer = (
                f"**Ficha Analítica Institucional: {target_node.label}** ({target_node.type.upper()})\n\n"
                f"• **Volumen acumulado:** {target_node.metrics.volume:,} estudiantes registrados en la red.\n"
                f"• **Perfil socioeconómico:** {estrato_text}, con un {rural_pct:.1f}% de procedencia rural.\n"
                f"• **Grado de conectividad:** {target_node.metrics.degree or len(connected_edges)} rutas activas de movilidad.\n"
                f"• **Principales flujos de intercambio:** {links_str}.\n\n"
                f"Se ha enfocado la cámara en **{target_node.label}** y se han resaltado sus conexiones directas en la escena 3D."
            )

            return {
                "answer": answer,
                "camera_command": {
                    "action": "focus_node",
                    "target_node_id": target_node.id,
                    "cluster_id": target_node.cluster,
                },
                "highlighted_node_ids": highlight_ids,
                "status": "fallback",
                "error_code": "HIGH_DEMAND_FALLBACK",
            }

        # -------------------------------------------------------------
        # CASO 2: Pregunta sobre Comunas / Territorio / Origen
        # -------------------------------------------------------------
        if any(w in msg for w in ["comuna", "barrio", "territorio", "origen", "zona"]):
            top_3_com = comunas[:3]
            top_com_names = [f"**{c.label}** ({c.metrics.volume:,} estudiantes)" for c in top_3_com]
            lead_comuna = top_3_com[0] if top_3_com else None
            focus_sentence = (
                f"Se ha enfocado la comuna líder (**{lead_comuna.label}**) en el visor 3D."
                if lead_comuna
                else "No se encontraron comunas individuales en la red actual."
            )

            answer = (
                f"**Análisis de Distribución Territorial por Comunas:**\n\n"
                f"En el histórico consolidado de Medellín, las comunas con mayor volumen de estudiantes hacia educación superior son:\n"
                f"1. {top_com_names[0] if len(top_com_names) > 0 else 'N/A'}\n"
                f"2. {top_com_names[1] if len(top_com_names) > 1 else 'N/A'}\n"
                f"3. {top_com_names[2] if len(top_com_names) > 2 else 'N/A'}\n\n"
                f"Estas zonas territoriales concentran los principales corredores de egreso secundario. "
                f"{focus_sentence}"
            )

            return {
                "answer": answer,
                "camera_command": (
                    {
                        "action": "focus_node",
                        "target_node_id": lead_comuna.id,
                        "cluster_id": lead_comuna.cluster,
                    }
                    if lead_comuna
                    else None
                ),
                "highlighted_node_ids": [c.id for c in top_3_com],
                "status": "fallback",
                "error_code": "HIGH_DEMAND_FALLBACK",
            }

        # -------------------------------------------------------------
        # CASO 3: Pregunta sobre Colegios / Instituciones de Bachillerato
        # -------------------------------------------------------------
        if any(w in msg for w in ["colegio", "escuela", "bachillerato", "institucion", "colegios"]):
            top_3_col = colegios[:3]
            top_col_names = [f"**{s.label}** ({s.metrics.volume:,} estudiantes)" for s in top_3_col]
            lead_col = top_3_col[0] if top_3_col else None
            focus_sentence = (
                f"Enfocando **{lead_col.label}** en la escena."
                if lead_col
                else "No se encontraron colegios individuales en la red actual."
            )

            answer = (
                f"**Principales Instituciones Educativas de Bachillerato:**\n\n"
                f"Los colegios que aportan mayor número de egresados vinculados a la red universitaria son:\n"
                f"1. {top_col_names[0] if len(top_col_names) > 0 else 'N/A'}\n"
                f"2. {top_col_names[1] if len(top_col_names) > 1 else 'N/A'}\n"
                f"3. {top_col_names[2] if len(top_col_names) > 2 else 'N/A'}\n\n"
                f"Estas instituciones funcionan como puentes clave de movilidad formativa hacia las facultades de la red. "
                f"{focus_sentence}"
            )

            return {
                "answer": answer,
                "camera_command": (
                    {
                        "action": "focus_node",
                        "target_node_id": lead_col.id,
                        "cluster_id": lead_col.cluster,
                    }
                    if lead_col
                    else None
                ),
                "highlighted_node_ids": [s.id for s in top_3_col],
                "status": "fallback",
                "error_code": "HIGH_DEMAND_FALLBACK",
            }

        # -------------------------------------------------------------
        # CASO 4: Pregunta sobre Facultades / Carreras / Destinos
        # -------------------------------------------------------------
        if any(w in msg for w in ["facultad", "facultades", "carrera", "carreras", "ingenieria", "universidad", "destino"]):
            top_3_fac = facultades[:3]
            top_fac_names = [f"**{f.label}** ({f.metrics.volume:,} estudiantes)" for f in top_3_fac]
            lead_fac = top_3_fac[0] if top_3_fac else None
            focus_sentence = (
                f"Enfocando la facultad principal (**{lead_fac.label}**)."
                if lead_fac
                else "No se encontraron facultades en la red actual."
            )

            answer = (
                f"**Concentración de Matrícula por Facultades Universitarias:**\n\n"
                f"Las facultades académicas con mayor volumen de atracción estudiantil son:\n"
                f"1. {top_fac_names[0] if len(top_fac_names) > 0 else 'N/A'}\n"
                f"2. {top_fac_names[1] if len(top_fac_names) > 1 else 'N/A'}\n"
                f"3. {top_fac_names[2] if len(top_fac_names) > 2 else 'N/A'}\n\n"
                f"{focus_sentence}"
            )

            return {
                "answer": answer,
                "camera_command": (
                    {
                        "action": "focus_node",
                        "target_node_id": lead_fac.id,
                        "cluster_id": lead_fac.cluster,
                    }
                    if lead_fac
                    else None
                ),
                "highlighted_node_ids": [f.id for f in top_3_fac],
                "status": "fallback",
                "error_code": "HIGH_DEMAND_FALLBACK",
            }

        # -------------------------------------------------------------
        # CASO 5: Pregunta sobre Estratos / Socioeconómico / Ruralidad
        # (Métricas calculadas dinámicamente desde el grafo)
        # -------------------------------------------------------------
        if any(w in msg for w in ["estrato", "estratos", "socioeconomico", "rural", "vulnerab"]):
            total_students = graph.meta.total_records
            total_comuna_vol = sum(c.metrics.volume for c in all_comunas) or 1
            weighted_rural = sum(
                c.metrics.volume * (c.metrics.rural_share or 0.0) for c in all_comunas
            )
            rural_pct = (weighted_rural / total_comuna_vol) * 100.0
            urban_pct = max(0.0, 100.0 - rural_pct)

            estratos_validos = [
                c.metrics.estrato_median
                for c in comunas
                if c.metrics.estrato_median is not None
            ]
            if estratos_validos:
                estrato_min = min(estratos_validos)
                estrato_max = max(estratos_validos)
                estrato_summary = f"Mediana territorial entre estrato {estrato_min:.1f} y {estrato_max:.1f} (excluyendo población rural)."
            else:
                estrato_summary = "Sin datos suficientes de estrato urbano en el grafo actual."

            top_rural = sorted(
                (c for c in comunas if (c.metrics.rural_share or 0.0) > 0),
                key=lambda c: c.metrics.rural_share or 0.0,
                reverse=True,
            )[:3]
            rural_names = (
                ", ".join(f"{c.label} ({(c.metrics.rural_share or 0.0) * 100:.1f}%)" for c in top_rural)
                if top_rural
                else "sin territorios con participación rural destacada"
            )

            answer = (
                f"**Estructura Socioeconómica y Procedencia (calculada del grafo):**\n\n"
                f"• **Población analizada:** {total_students:,} estudiantes.\n"
                f"• **Estrato urbano:** {estrato_summary}\n"
                f"• **Procedencia territorial:** {urban_pct:.1f}% urbana y {rural_pct:.1f}% rural.\n"
                f"• **Territorios con mayor proporción rural:** {rural_names}."
            )

            highlight_targets = [c.id for c in top_rural] if top_rural else [c.id for c in comunas[:3]]
            return {
                "answer": answer,
                "camera_command": {
                    "action": "reset_view",
                    "target_node_id": None,
                    "cluster_id": None,
                },
                "highlighted_node_ids": highlight_targets,
                "status": "fallback",
                "error_code": "HIGH_DEMAND_FALLBACK",
            }

        # -------------------------------------------------------------
        # CASO 6: Panorama General de la Red
        # -------------------------------------------------------------
        total_students = graph.meta.total_records
        node_count = graph.meta.node_count
        edge_count = graph.meta.edge_count

        answer = (
            f"**Observatorio de Movilidad Académica SIMA-3D:**\n\n"
            f"La topología actual consolida **{total_students:,} estudiantes** distribuidos en **{node_count} nodos agregados** "
            f"y **{edge_count} flujos interinstitucionales**.\n\n"
            f"• **Estructura:** Conecta territorios de origen (Comunas) a través de instituciones de bachillerato (Colegios) "
            f"hacia destinos universitarios (Facultades).\n"
            f"• **Interacción:** Puedes hacer clic en cualquier esfera del mapa 3D para inspeccionar sus métricas individuales o consultar "
            f"patrones específicos de comunas, colegios y facultades."
        )

        return {
            "answer": answer,
            "camera_command": {
                "action": "reset_view",
                "target_node_id": None,
                "cluster_id": None,
            },
            "highlighted_node_ids": [facultades[0].id] if facultades else [],
            "status": "fallback",
            "error_code": "HIGH_DEMAND_FALLBACK",
        }
