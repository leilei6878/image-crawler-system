import pytest

from src.config import Settings
from src.social import MockSocialAdapter, SourceAdapterRegistry, create_default_registry


def test_default_registry_maps_supported_platforms_to_adapters():
    registry = create_default_registry(Settings())

    assert registry.get("instagram").adapter_name == "mock_social_adapter"
    assert registry.get("xiaohongshu").adapter_name == "mock_social_adapter"
    assert registry.get("website").adapter_name == "generic_public_page_adapter"
    assert "pinterest" in registry.registered_platforms()


def test_registry_rejects_duplicate_platform_registration():
    registry = SourceAdapterRegistry()
    registry.register(MockSocialAdapter(Settings()))

    with pytest.raises(ValueError, match="adapter already registered"):
        registry.register(MockSocialAdapter(Settings()))


def test_registry_reports_missing_adapter():
    registry = SourceAdapterRegistry()

    with pytest.raises(KeyError, match="no source adapter registered"):
        registry.get("instagram")
