const GenericAdapter = require('./generic');
const PinterestAdapter = require('./pinterest');

const adapters = {
  pinterest: () => new PinterestAdapter(),
  generic: () => new GenericAdapter(),
};

class AdapterFactory {
  static create(siteType) {
    const factory = adapters[siteType] || adapters.generic;
    return factory();
  }
}

module.exports = AdapterFactory;
