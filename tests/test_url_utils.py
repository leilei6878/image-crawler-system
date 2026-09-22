from src.models import is_valid_url, normalize_url


def test_normalize_url_filters_invalid_values():
    assert normalize_url("") is None
    assert normalize_url("   ") is None
    assert normalize_url("data:image/png;base64,abc") is None
    assert normalize_url("javascript:alert(1)") is None
    assert normalize_url("mailto:test@example.com") is None


def test_normalize_url_resolves_relative_and_removes_fragment():
    assert (
        normalize_url("/images/pic.jpg#preview", base_url="HTTPS://Example.COM/gallery/")
        == "https://example.com/images/pic.jpg"
    )


def test_is_valid_url_accepts_http_and_https_only():
    assert is_valid_url("https://example.com/image.jpg") is True
    assert is_valid_url("http://example.com/image.jpg") is True
    assert is_valid_url("ftp://example.com/image.jpg") is False
