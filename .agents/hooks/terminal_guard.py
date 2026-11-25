import json
import re
import sys


# Comandos bloqueados permanentemente (Denylist)
DENY_PATTERNS = [
    (r"(?i)\bgit\s+push\b.*(--force|-f\b)", "Bloqueado: git push --force está prohibido."),
    (r"(?i)\bgit\s+reset\s+--hard\b", "Bloqueado: git reset --hard puede destruir trabajo local."),
    (r"(?i)\bgit\s+clean\s+-[a-z]*f", "Bloqueado: git clean -f elimina archivos sin seguimiento."),
    (r"(?i)\brm\s+-[a-z]*r[a-z]*f\b", "Bloqueado: borrado recursivo forzado (rm -rf)."),
    (r"(?i)\bRemove-Item\b.*-Recurse.*-Force", "Bloqueado: Remove-Item -Recurse -Force."),
    (r"(?i)(Get-Content|type|cat|more|Select-String)\b.*\.env(\s|$|\"|')", "Bloqueado: lectura directa de archivos .env con secretos."),
    (r"(?i)\b(reg\s+(add|delete)|Set-ExecutionPolicy|shutdown|Restart-Computer|format\s+[a-z]:)\b", "Bloqueado: modificación de sistema operativo."),
]

# Comandos seguros de ejecución rápida (Allowlist)
ALLOW_PATTERNS = [
    r"(?i)^(cd\s+[^;&|]+;\s*)?c:\\red3d\\\.venv\\Scripts\\python\.exe\s+-m\s+pytest\b",
    r"(?i)^(cd\s+[^;&|]+;\s*)?pytest\b",
    r"(?i)^(cd\s+[^;&|]+;\s*)?npm\s+(test|run\s+(lint|build|qa:e2e|dev))\b",
    r"(?i)^(cd\s+[^;&|]+;\s*)?npx\s+tsc\b.*--noEmit",
    r"(?i)^(cd\s+[^;&|]+;\s*)?git\s+(status|diff|log|branch|ls-files|worktree\s+list)\b",
]


def evaluate_command(command_line: str) -> dict:
    cmd = (command_line or "").strip()
    if not cmd:
        return {"decision": "ask", "reason": "Comando vacío; requiere revisión manual."}

    for pattern, reason in DENY_PATTERNS:
        if re.search(pattern, cmd):
            return {"decision": "deny", "reason": reason}

    # Si encadena múltiples comandos con &&, || o | fuera de un cd inicial, pedir confirmación
    # salvo que todos los segmentos estén en la allowlist
    segments = [s.strip() for s in re.split(r";|&&", cmd) if s.strip()]
    if segments and all(
        re.match(r"(?i)^cd\s+", seg) or any(re.search(pat, seg) for pat in ALLOW_PATTERNS)
        for seg in segments
    ):
        return {
            "decision": "allow",
            "reason": "Comando en la allowlist segura de SIMA-3D.",
        }

    return {
        "decision": "ask",
        "reason": "Comando fuera de la allowlist segura; requiere aprobación manual.",
    }


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        args = payload.get("toolCall", {}).get("args", {})
        command_line = args.get("CommandLine") or args.get("command") or ""
        result = evaluate_command(command_line)
    except Exception:
        result = {
            "decision": "ask",
            "reason": "Error evaluando el comando en terminal_guard; se solicita aprobación manual.",
        }

    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
