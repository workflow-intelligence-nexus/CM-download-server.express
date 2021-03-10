const Writable = require("stream").Writable;

module.exports = class FakeOutsource extends Writable {
  constructor(options) {
    super(options);
  }

  _write(chunk, encoding, callback) {
    callback();
  }
};

// TODO: Fix blocking write in the response stream
// const Writable = require("stream").Writable;

// module.exports = class FakeOutsource extends Writable {
//   constructor(options) {
//     super(options);
//     this.response = options.response;
//     this.time = new Date();
//     this.interval = 10000;
//   }

//   _write(chunk, encoding, callback) {
//     let currTime = new Date();
//     const diff = currTime - this.time;
//     if (diff > this.interval) {
//       this.time = currTime;
//       console.log('TIME TIME TIME TIME')
//       this.response.write('*')
//     }
//     callback();
//   }
// };
