// Mock for ora module to avoid ES module issues in Jest
module.exports = function ora(options) {
  return {
    start: () => ({
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    }),
    succeed: () => {},
    fail: () => {},
    stop: () => {},
    text: '',
    color: 'blue',
  };
};

module.exports.default = module.exports;
