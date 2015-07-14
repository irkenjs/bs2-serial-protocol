'use strict';

var util = require('util');
var when = require('when');
var nodefn = require('when/node');
var reemit = require('re-emitter');
var cloneDeep = require('lodash/lang/cloneDeep');
var SerialPort = require('serialport').SerialPort;
var EventEmitter = require('events').EventEmitter;

var TerminalStreamParser = require('./lib/terminal-stream-parser');

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

var toLift = ['open', 'close', 'set', 'update', 'write'];

// only lift the functions we use
function lifter(result, lifted, name){
  if(toLift.indexOf(name) !== -1){
    result[name] = lifted;
  }

  return result;
}

function Protocol(options){
  var customTransport = options.transport;

  EventEmitter.call(this);

  //todo fail on no options.path
  var path = options.path;
  var opts = options.options || { baudrate: 9600 };
  var TransportCtor = SerialPort;
  if(customTransport){
    path = customTransport.path;
    opts = customTransport.options;
    TransportCtor = customTransport.constructor;
  }

  this.terminal = new TerminalStreamParser();

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
  // passing Transport.prototype to the last argument uses that as the accumulator
  nodefn.liftAll(TransportCtor.prototype, lifter, Transport.prototype);

  this._isOpen = false;
  var transport = this._transport = new Transport(path, opts, false);
  // saving the original options from the transport to allow
  this._options = cloneDeep({
    path: transport.path,
    options: transport.options
  });

  reemit(transport, this, ['open', 'close']);

  // if we are given a transport, attempt to close it
  if(customTransport){
    // make this a promise for simpler code paths
    this._originalTransportClosed = closeCustomTransport(customTransport);
  } else {
    this._originalTransportClosed = when.resolve();
  }
}

util.inherits(Protocol, EventEmitter);

Protocol.prototype._open = function(cb){
  var self = this;
  var transport = this._transport;

  var promise;
  if(this._isOpen){
    promise = when.reject(new Error('Transport already open.'));
  } else {
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

Protocol.prototype.enterProgramming = function(options, cb){
  var self = this;
  if(typeof options === 'function'){
    cb = options;
    options = {};
  }else{
    options = options || {};
  }

  var promise = this._originalTransportClosed
    .then(function(){
      if(self._isOpen){
        return self._close();
      }
    })
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

Protocol.prototype.exitProgramming = function(options, cb){
  var self = this;

  if(typeof options === 'function'){
    cb = options;
    options = {};
  }else{
    options = options || {};
  }

  var promise = this.signoff()
    .then(function(){
      if(!options.keepOpen){
        return self._close();
      }
      if(options.listen){
        return self.listenPort();
      }
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._emitData = function _emitData(chunk){
  this.emit('terminal', this.terminal.parseStreamChunk(chunk));
};

Protocol.prototype.listenPort = function listenPort(cb){
  this._transport.on('data', this._emitData.bind(this));

  return nodefn.bindCallback(when.resolve(), cb);
};

Protocol.prototype.send = function send(data, cb){
  var transport = this._transport;

  var responseLength = data.length + 1;

  var defer = when.defer();

  var buffer = new Buffer(0);
  function onChunk(chunk){
    buffer = Buffer.concat([buffer, chunk]);
    if(buffer.length < responseLength){
      // keep buffering
      return;
    }

    if (buffer.length > responseLength) {
      // or ignore after
      defer.reject(new Error('buffer overflow ' + buffer.length + ' > ' + responseLength));
      return;
    }
    if (buffer.length === responseLength) {
      defer.resolve(buffer[data.length]);
    }
  }

  transport.on('data', onChunk);

  transport.write(data)
    .catch(defer.reject);

  var promise = defer.promise.finally(function(){
    transport.removeListener('data', onChunk);
  });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.write = function(data, cb){
  var transport = this._transport;

  var promise = transport.write(data);

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

Protocol.prototype.open = function open(cb){
  return this._open(cb);
};

Protocol.prototype.close = function close(cb){
  if(this._isOpen){
    return this._close(cb);
  }else{
    return nodefn.bindCallback(when.resolve(), cb);
  }
};

module.exports = Protocol;
