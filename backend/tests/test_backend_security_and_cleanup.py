import importlib
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _load_main_module(api_key: str, cors_origins: str | None = None):
    os.environ["BACKEND_API_KEY"] = api_key
    if cors_origins is None:
        os.environ.pop("BACKEND_CORS_ORIGINS", None)
    else:
        os.environ["BACKEND_CORS_ORIGINS"] = cors_origins
    import backend.main as main_module

    importlib.reload(main_module)
    return main_module


def test_request_auth_helper_enforces_api_key():
    main_module = _load_main_module("unit-test-key")

    assert (
        main_module._is_api_request_authorized(
            path="/api/train/models",
            method="GET",
            headers={"x-api-key": "unit-test-key"},
            configured_api_key="unit-test-key",
        )
        is True
    )
    assert (
        main_module._is_api_request_authorized(
            path="/api/train/models",
            method="GET",
            headers={},
            configured_api_key="unit-test-key",
        )
        is False
    )


def test_cors_origins_excludes_wildcard_when_credentials_enabled():
    main_module = _load_main_module("unit-test-key")

    origins = main_module._build_cors_origins()
    assert "*" not in origins
    assert main_module._allow_cors_credentials(origins) is True


def test_cors_wildcard_disables_credentials():
    main_module = _load_main_module("unit-test-key", cors_origins="*")

    origins = main_module._build_cors_origins()
    assert origins == ["*"]
    assert main_module._allow_cors_credentials(origins) is False


def test_safe_remove_temp_file_is_idempotent(tmp_path):
    main_module = _load_main_module("unit-test-key")

    target = tmp_path / "temp-audio.wav"
    target.write_bytes(b"audio")

    main_module._safe_remove_temp_file(str(target))
    assert not target.exists()

    # Should not raise if file is already gone.
    main_module._safe_remove_temp_file(str(target))
