const Writable = require("stream").Writable;

module.exports = class FakeOutsource extends Writable {
  constructor(options) {
    super(options);
  }

  _write(chunk, encoding, callback) {
    callback();
  }
};
