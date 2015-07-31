'use strict';

var util = require('util');
var when = require('when');
var nodefn = require('when/node');
var reemit = require('re-emitter');
var SerialPort = require('irken-serialport');
var EventEmitter = require('events').EventEmitter;

var TerminalStreamParser = require('./lib/terminal-stream-parser');
var TransmitStreamParser = require('./lib/transmit-stream-parser');

function Protocol(options){
  var Transport = SerialPort;
  if(options && options.transport && typeof options.transport === 'function'){
    Transport = options.transport;
  }

  EventEmitter.call(this);
  var transport = this._transport = new Transport(options);

  this._terminal = new TerminalStreamParser();
  this._transmit = new TransmitStreamParser();

  reemit(transport, this, ['open', 'close']);
}

util.inherits(Protocol, EventEmitter);

Protocol.prototype.enterProgramming = function enterProgramming(options){
  var self = this;
  var transport = this._transport;
  options = options || {};

  return transport.safeClose()
    .then(function(){
      return transport.open();
    })
    .then(function(){
      return transport.setBreak();
    })
    .then(function(){
      return self.reset();
    })
    .delay(100) //need to wait for the setbrk byte to get out on the line
    .then(function(){
      return transport.clearBreak();
    });
};

Protocol.prototype.exitProgramming = function exitProgramming(options){
  var self = this;
  var transport = this._transport;
  options = options || {};

  return this.signoff()
    .then(function(){
      if(!options.keepOpen){
        return transport.close();
      }
      if(options.listen){
        return self.listenPort();
      }
    });
};

Protocol.prototype._emitData = function _emitData(chunk){
  this.emit('terminal', this._terminal.parseStreamChunk(chunk));
};

Protocol.prototype.listenPort = function listenPort(){
  this._transport.on('data', this._emitData.bind(this));

  return when.resolve();
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

Protocol.prototype.write = function write(data){
  var transport = this._transport;

  return transport.write(data)
    .then(function(){
      var transmitEvents = this._transmit.parseStreamChunk(data);
      this.emit('transmit', transmitEvents);
    });
};

Protocol.prototype.reset = function reset(){
  var transport = this._transport;

  return transport.setDtr()
    .delay(2)
    .then(function(){
      return transport.clrDtr();
    });
};

Protocol.prototype.signoff = function signoff(){
  var transport = this._transport;

  var signoffBit = new Buffer([0]);

  return transport.write(signoffBit);
};

Protocol.prototype.open = function open(){
  return this._transport.open();
};

Protocol.prototype.close = function close(){
  return this._transport.close();
};

module.exports = Protocol;
