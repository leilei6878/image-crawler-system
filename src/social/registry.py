from src.config import Settings
from src.models.social import SUPPORTED_PLATFORMS
from src.social.adapters import (
    GenericPublicPageAdapter,
    MockSocialAdapter,
    SourceAdapter,
)


class SourceAdapterRegistry:
    def __init__(self) -> None:
        self._adapters_by_platform: dict[str, SourceAdapter] = {}

    def register(self, adapter: SourceAdapter, *, replace: bool = False) -> None:
        if not adapter.supported_platforms:
            raise ValueError("adapter must declare supported_platforms")

        for platform in adapter.supported_platforms:
            if platform not in SUPPORTED_PLATFORMS:
                raise ValueError(f"unsupported platform: {platform}")
            if platform in self._adapters_by_platform and not replace:
                raise ValueError(f"adapter already registered for platform: {platform}")
            self._adapters_by_platform[platform] = adapter

    def get(self, platform: str) -> SourceAdapter:
        try:
            return self._adapters_by_platform[platform]
        except KeyError as exc:
            raise KeyError(f"no source adapter registered for platform: {platform}") from exc

    def registered_platforms(self) -> list[str]:
        return sorted(self._adapters_by_platform)


def create_default_registry(settings: Settings) -> SourceAdapterRegistry:
    registry = SourceAdapterRegistry()
    registry.register(MockSocialAdapter(settings))
    registry.register(GenericPublicPageAdapter(settings))
    return registry
