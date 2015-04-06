'use strict';

var SerialPort = require('serialport').SerialPort;
var when = require('when');
var nodefn = require('when/node');

function Protocol(options){
  var self = this;

  var transport = options.transport;

  //todo fail on no options.path
  var path = options.path;
  var opts = options.options || { baudrate: 200 };
  var TransportCtor = SerialPort;
  if(transport){
    path = transport.path;
    opts = transport.options;
    TransportCtor = transport.constructor;
  }

  // if we receive a SerialPort in options, we don't want to mutate it
  // so we use this pattern to copy and promisify it
  function Transport(){
    TransportCtor.apply(this, arguments);
  }
  Transport.prototype = nodefn.liftAll(TransportCtor.prototype);

  this._transport = new Transport(path, opts, false);

  this._queue = null;

  this._transport.on('data', function(chunk){
    if(typeof self._queue === 'function'){
      self._queue(chunk);
    }
  });
}

Protocol.prototype._setDtr = function(cb){
  var transport = this._transport;

  var promise = transport.set({ dtr: false });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._clrDtr = function(cb){
  var transport = this._transport;

  var promise = transport.set({ dtr: true });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._setBrk = function(cb){
  var transport = this._transport;

  var brkBit = new Buffer([0x00]);

  var promise = transport.write(brkBit);

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._clrBrk = function(cb){
  var transport = this._transport;

  var promise = transport.update({ baudRate: 9600 });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.enterProgramming = function(cb){
  var self = this;
  var transport = this._transport;

  var promise = transport.open()
    .then(function(){
      return self._setBrk();
    })
    .then(function(){
      return self.reset();
    })
    .delay(100) //need to wait for the setbrk byte to get out on the line
    .then(function(){
      return self._clrBrk();
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.exitProgramming = function(cb){
  var transport = this._transport;

  var promise = this.signoff()
    .then(function(){
      return transport.close();
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._onResponse = function(fn){
  this._queue = fn;
};

Protocol.prototype.send = function send(data, cb){
  var self = this;
  var serial = this._transport;

  var responseLength = data.length + 1;

  var promise = when.promise(function(resolve, reject) {

    var buffer = new Buffer(0);
    function onChunk(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > responseLength) {
        // or ignore after
        return reject(new Error('buffer overflow ' + buffer.length + ' > ' + responseLength));
      }
      if (buffer.length === responseLength) {
        resolve(buffer[data.length]);
      }
    }

    self._onResponse(onChunk);

    serial.write(data, function (writeError) {
      if (writeError) {
        return reject(writeError);
      }
    });
  });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.reset = function reset(cb){
  var self = this;

  var promise = this._setDtr()
    .delay(2)
    .then(function(){
      return self._clrDtr();
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.signoff = function signoff(cb){
  var transport = this._transport;

  var signoffBit = new Buffer([0]);

  var promise = transport.write(signoffBit);

  return nodefn.bindCallback(promise, cb);
};

module.exports = Protocol;
