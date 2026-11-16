from __future__ import annotations

from conftest import ORIGIN, TOKEN, auth


def test_health_is_open_on_loopback(make_client):
    res = make_client().get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_rejects_foreign_host_header_dns_rebinding(make_client):
    res = make_client().get("/health", headers={"Host": "evil.example:8765"})
    assert res.status_code == 421


def test_rejects_unknown_origin(make_client):
    res = make_client().get("/health", headers={"Origin": "https://evil.example"})
    assert res.status_code == 403


def test_allowed_origin_gets_cors_header(make_client):
    res = make_client().get("/health", headers={"Origin": ORIGIN})
    assert res.headers["access-control-allow-origin"] == ORIGIN


def test_preflight_supports_private_network_access(make_client):
    res = make_client().options(
        "/v1/generate",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert res.status_code == 204
    assert res.headers["access-control-allow-private-network"] == "true"
    assert res.headers["access-control-allow-origin"] == ORIGIN


def test_preflight_from_unknown_origin_is_refused(make_client):
    res = make_client().options(
        "/v1/models", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
    )
    assert res.status_code == 403
    assert "access-control-allow-origin" not in res.headers


def test_api_requires_pairing_token(make_client):
    client = make_client()
    assert client.get("/v1/models", headers={"Origin": ORIGIN}).status_code == 401
    assert (
        client.get("/v1/models", headers={"Origin": ORIGIN, "Authorization": "Bearer wrong"}).status_code
        == 401
    )
    assert client.get("/v1/models", headers=auth()).status_code == 200


def test_unsupported_methods_are_refused(make_client):
    assert make_client().put("/v1/generate", headers=auth()).status_code == 405


def test_oversized_request_is_refused_before_reading(make_client, settings):
    res = make_client().post(
        "/v1/generate",
        headers={**auth(), "Content-Length": str(settings.max_upload_bytes * 2)},
        content=b"x",
    )
    assert res.status_code == 413


def test_token_constant_is_long_enough():
    assert len(TOKEN) >= 24
