from src.extractors.bridge import extract_payload


def test_bridge_uses_existing_extractor_and_returns_normalized_assets():
    result = extract_payload({
        "html": '<img src="/a.png"><img src="/a.png"><meta property="og:image" content="/b.png">',
        "url": "https://example.com/page",
        "max_items": 2,
    })
    assert [item["normalized_image_url"] for item in result["images"]] == [
        "https://example.com/a.png", "https://example.com/b.png"
    ]
