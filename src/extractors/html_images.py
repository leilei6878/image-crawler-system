from bs4 import BeautifulSoup

from src.models import ImageAsset, normalize_url


def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _parse_srcset(value: str | None) -> list[str]:
    if not value:
        return []

    urls: list[str] = []
    for candidate in value.split(","):
        parts = candidate.strip().split()
        if parts:
            urls.append(parts[0])
    return urls


def extract_image_assets(
    html: str,
    source_url: str,
    source_name: str = "generic_html",
) -> list[ImageAsset]:
    soup = BeautifulSoup(html, "html.parser")
    assets: list[ImageAsset] = []
    seen: set[str] = set()

    def add_asset(
        image_url: str | None,
        *,
        title: str | None = None,
        alt_text: str | None = None,
        width: int | None = None,
        height: int | None = None,
        content_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> None:
        normalized_image_url = normalize_url(image_url, base_url=source_url)
        if normalized_image_url is None or normalized_image_url in seen:
            return

        seen.add(normalized_image_url)
        assets.append(
            ImageAsset(
                source_name=source_name,
                source_url=source_url,
                image_url=(image_url or "").strip(),
                normalized_image_url=normalized_image_url,
                title=title,
                alt_text=alt_text,
                width=width,
                height=height,
                content_type=content_type,
                metadata=metadata or {},
            )
        )

    for img in soup.find_all("img"):
        title = img.get("title")
        alt_text = img.get("alt")
        width = _parse_int(img.get("width"))
        height = _parse_int(img.get("height"))

        add_asset(
            img.get("src"),
            title=title,
            alt_text=alt_text,
            width=width,
            height=height,
            metadata={"source_element": "img[src]"},
        )

        for srcset_url in _parse_srcset(img.get("srcset")):
            add_asset(
                srcset_url,
                title=title,
                alt_text=alt_text,
                width=width,
                height=height,
                metadata={"source_element": "img[srcset]"},
            )

    for meta in soup.find_all("meta", attrs={"property": "og:image"}):
        add_asset(
            meta.get("content"),
            metadata={"source_element": "meta[property=og:image]"},
        )

    for link in soup.find_all("link"):
        rel_values = link.get("rel") or []
        normalized_rels = {str(value).lower() for value in rel_values}
        if "image_src" in normalized_rels:
            add_asset(
                link.get("href"),
                metadata={"source_element": "link[rel=image_src]"},
            )

    return assets
