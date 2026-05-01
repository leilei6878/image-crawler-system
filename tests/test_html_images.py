from src.extractors import extract_image_assets


def test_extract_image_assets_from_common_html_locations():
    html = """
    <html>
      <head>
        <meta property="og:image" content="/images/hero.jpg">
        <link rel="image_src" href="https://cdn.example.com/share.png">
      </head>
      <body>
        <img src="/images/hero.jpg" alt="Hero" title="Hero title" width="640" height="480">
        <img srcset="/images/small.jpg 1x, /images/large.jpg 2x" alt="Responsive">
        <img src="data:image/png;base64,abc">
        <img src="javascript:alert(1)">
      </body>
    </html>
    """

    assets = extract_image_assets(html, "https://example.com/gallery/page.html")
    urls = [asset.normalized_image_url for asset in assets]

    assert urls == [
        "https://example.com/images/hero.jpg",
        "https://example.com/images/small.jpg",
        "https://example.com/images/large.jpg",
        "https://cdn.example.com/share.png",
    ]
    assert assets[0].alt_text == "Hero"
    assert assets[0].title == "Hero title"
    assert assets[0].width == 640
    assert assets[0].height == 480


def test_extract_image_assets_deduplicates_by_normalized_url():
    html = """
    <img src="https://EXAMPLE.com:443/a.jpg#one">
    <meta property="og:image" content="https://example.com/a.jpg#two">
    """

    assets = extract_image_assets(html, "https://example.com/")

    assert len(assets) == 1
    assert assets[0].normalized_image_url == "https://example.com/a.jpg"
