from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.social.api_client import run_api_command


def test_cli_reads_management_job_status_without_local_state(monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", "test-only-token")
    session = Mock()
    session.request.return_value.status_code = 200
    session.request.return_value.json.return_value = {"id": 17, "status": "running"}
    result = run_api_command(SimpleNamespace(
        command="job-status", job_id=17, server_url="http://127.0.0.1:3100"
    ), session)
    assert result["status"] == "running"
    args, kwargs = session.request.call_args
    assert args == ("GET", "http://127.0.0.1:3100/api/social/jobs/17/status")
    assert kwargs["allow_redirects"] is False
    assert kwargs["headers"]["Authorization"] == "Bearer test-only-token"


def test_cli_fails_closed_without_management_credentials(monkeypatch):
    monkeypatch.delenv("ADMIN_API_TOKEN", raising=False)
    with pytest.raises(ValueError, match="ADMIN_API_TOKEN"):
        run_api_command(SimpleNamespace(server_url="http://127.0.0.1:3100"))
