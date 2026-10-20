"""Network-free JSON bridge used by the distributed Node Worker."""

import json
import sys
from dataclasses import asdict

from src.extractors.html_images import extract_image_assets


def extract_payload(payload: dict) -> dict:
    assets = extract_image_assets(
        payload["html"], source_url=payload["url"],
        source_name=payload.get("source_name", "generic_html"),
    )
    limit = int(payload.get("max_items", 1000))
    if not 1 <= limit <= 1000:
        raise ValueError("max_items must be between 1 and 1000")
    return {"images": [asdict(asset) for asset in assets[:limit]]}


if __name__ == "__main__":
    print(json.dumps(extract_payload(json.load(sys.stdin)), default=str))
