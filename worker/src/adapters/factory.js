const GenericAdapter = require('./generic');

const adapters = {
  generic: () => new GenericAdapter(),
};

const unsupportedSiteTypes = new Set(['pinterest', 'behance', 'unsplash', 'dribbble']);

class AdapterFactory {
  static create(siteType) {
    if (unsupportedSiteTypes.has(siteType)) {
      throw new Error(`site_type=${siteType} is not supported in distributed crawler V1. Use generic public website crawling only.`);
    }
    const factory = adapters[siteType] || adapters.generic;
    return factory();
  }

  static supportedSiteTypes() {
    return Object.keys(adapters);
  }
}

module.exports = AdapterFactory;
