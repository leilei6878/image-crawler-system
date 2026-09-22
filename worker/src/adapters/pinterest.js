const BaseAdapter = require('./base');

class PinterestAdapter extends BaseAdapter {
  constructor() {
    super('pinterest');
  }

  async crawl() {
    throw new Error('Pinterest adapter is not implemented in distributed crawler V1. Use generic public website crawling only.');
  }
}

module.exports = PinterestAdapter;
