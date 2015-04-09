'use strict';

var util = require('util');

var cloneDeep = require('lodash/lang/cloneDeep');
var SerialPort = require('serialport').SerialPort;
var when = require('when');
var nodefn = require('when/node');

var openRegexp = new RegExp('Serialport not open.');

function closeCustomTransport(customTransport){
  return when.promise(function(resolve, reject){
    customTransport.close(function(err){
      if(err && !openRegexp.test(err.message)){
        // reject if error is not "Serialport not open."
        return reject(err);
      }

      resolve();
    });
  });
}

function Protocol(options){
  var customTransport = options.transport;

  //todo fail on no options.path
  var path = options.path;
  var opts = options.options || { baudrate: 9600 };
  var TransportCtor = SerialPort;
  if(customTransport){
    path = customTransport.path;
    opts = customTransport.options;
    TransportCtor = customTransport.constructor;
  }

  // if we receive a SerialPort in options, we don't want to mutate it
  // so we use this pattern to copy and promisify it
  function Transport(){
    TransportCtor.apply(this, arguments);

    if(customTransport){
      this.options.dataCallback = function(data){
        customTransport.options.parser(this, data);
      }.bind(this);
    }
  }
  util.inherits(Transport, TransportCtor);
  // undefined causes liftAll to use the default combiner
  // passing Transport.prototype to the last argument uses that as the accumulator
  nodefn.liftAll(TransportCtor.prototype, undefined, Transport.prototype);

  this._isOpen = false;
  var transport = this._transport = new Transport(path, opts, false);
  // saving the original options from the transport to allow
  this._options = cloneDeep({
    path: transport.path,
    options: transport.options
  });

  // if we are given a transport, attempt to close it
  if(customTransport){
    // make this a promise for simpler code paths
    this._originalTransportClosed = closeCustomTransport(customTransport);
  }

  this._queue = null;
}

Protocol.prototype._open = function(cb){
  var self = this;
  var transport = this._transport;

  var promise;
  if(this._isOpen){
    promise = when.reject(new Error('Transport already open.'));
  } else {
    // the close method removes all event listeners,
    // so we need to rebind on our open
    transport.on('data', function(chunk){
      if(typeof self._queue === 'function'){
        self._queue(chunk);
      }
    });

    promise = transport.open()
      .tap(function(){
        self._isOpen = true;
      });
  }

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._close = function(cb){
  var self = this;
  var transport = this._transport;

  function onClose(){
    self._isOpen = false;
  }

  var promise = transport.close()
    .tap(onClose)
    .catch(function(err){
      if(err && !openRegexp.test(err.message)){
        // rethrow error if it is not "Serialport not open."
        throw err;
      }

      onClose();
    });

  return nodefn.bindCallback(promise, cb);
};

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

  var promise = transport.update({ baudRate: 200 })
    .then(function(){
      return transport.write(brkBit);
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._clrBrk = function(cb){
  var transport = this._transport;
  var options = this._options.options;

  var promise = transport.update({ baudRate: options.baudrate });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.enterProgramming = function(cb){
  var self = this;

  var promise = this._originalTransportClosed
    .then(function(){
      return self._open();
    })
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
  var self = this;

  var promise = this.signoff()
    .then(function(){
      return self._close();
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._onResponse = function(fn){
  this._queue = fn;
};

Protocol.prototype.send = function send(data, cb){
  var self = this;
  var transport = this._transport;

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

    transport.write(data)
      .catch(reject);
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
