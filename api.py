"""
Root ASGI shim for the support RAG API.

This lets `uvicorn api:app` work from the repository root while the real
implementation stays in `code/api.py`.
"""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_API_PATH = Path(__file__).parent / "code" / "api.py"
_SPEC = spec_from_file_location("support_rag_code_api", _API_PATH)

if _SPEC is None or _SPEC.loader is None:
    raise ImportError(f"Unable to load ASGI app from {_API_PATH}")

_MODULE = module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)

app = _MODULE.app
