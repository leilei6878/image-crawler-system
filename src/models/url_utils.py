from urllib.parse import urldefrag, urljoin, urlparse, urlunparse

INVALID_SCHEMES = {"", "data", "javascript", "mailto", "tel"}
VALID_SCHEMES = {"http", "https"}


def normalize_url(raw_url: str | None, base_url: str | None = None) -> str | None:
    if raw_url is None:
        return None

    candidate = raw_url.strip()
    if not candidate:
        return None

    parsed_candidate = urlparse(candidate)
    if parsed_candidate.scheme.lower() in INVALID_SCHEMES and parsed_candidate.scheme:
        return None

    if base_url:
        candidate = urljoin(base_url, candidate)

    candidate, _fragment = urldefrag(candidate)
    parsed = urlparse(candidate)
    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower() if parsed.hostname else ""

    if scheme not in VALID_SCHEMES or not hostname:
        return None

    netloc = hostname
    if parsed.port and not (
        (scheme == "http" and parsed.port == 80)
        or (scheme == "https" and parsed.port == 443)
    ):
        netloc = f"{hostname}:{parsed.port}"

    return urlunparse(
        (
            scheme,
            netloc,
            parsed.path or "/",
            "",
            parsed.query,
            "",
        )
    )


def is_valid_url(raw_url: str | None, base_url: str | None = None) -> bool:
    return normalize_url(raw_url, base_url=base_url) is not None
