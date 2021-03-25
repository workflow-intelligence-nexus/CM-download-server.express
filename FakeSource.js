const Readable = require("stream").Readable;

module.exports = class FakeSource extends Readable {
  constructor(options) {
    super(options);
    this._max = options.size;
    this._chunkSize = options.chunkSize; // bytes
    this._pointer = 0;
    this._isOnce = false;
  }

  _read() {
    let i = (this._pointer += this._chunkSize);
    if (i > this._max) {
      if (!this._isOnce) {
        this._isOnce = true;
        const lastPart = this._max - (i - this._chunkSize);
        this.push(Buffer.from(new ArrayBuffer(lastPart)));
      } else {
        this.push(null);
      }
    } else {
      const buf = Buffer.from(new ArrayBuffer(this._chunkSize));
      this.push(buf);
    }
  }
};
