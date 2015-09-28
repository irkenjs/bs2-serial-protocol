'use strict';

var _ = require('lodash');
var util = require('util');
var when = require('when');
var nodefn = require('when/node');
var reemit = require('re-emitter');
var EventEmitter = require('events').EventEmitter;

var Transport = require('./transport');

var TerminalStreamParser = require('./lib/terminal-stream-parser');
var TransmitStreamParser = require('./lib/transmit-stream-parser');

function Protocol(options){
  EventEmitter.call(this);

  this._terminal = new TerminalStreamParser();
  this._transmit = new TransmitStreamParser();

  var TransportCtor = options.transport || Transport;

  this._options = {
    echo: options.echo || false
  };

  this._transport = new TransportCtor(_.omit(options, 'transport'));

  reemit(this._transport, this, ['open', 'close', 'data']);
}

util.inherits(Protocol, EventEmitter);

Protocol.prototype.isOpen = function isOpen(){
  return this._transport.isOpen();
};

Protocol.prototype.open = function(cb){
  var promise;
  if(this.isOpen()){
    promise = when.resolve();
  }else{
    promise = this._transport.open();
  }
  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.close = function(cb){
  var promise;
  if(!this.isOpen()){
    promise = when.resolve();
  }else{
    promise = this._transport.close();
  }
  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.enterProgramming = function(options, cb){
  var self = this;
  var transport = this._transport;

  if(typeof options === 'function'){
    cb = options;
    options = {};
  }else{
    options = options || {};
  }

  var promise = transport.open()
    .then(function(){
      transport.autoRecover = false;
      return transport.setBreak();
    })
    .then(function(){
      return transport.set({ dtr: false });
    })
    .then(function(){
      return transport.set({ dtr: true }).delay(60);
    })
    .then(function(){
      return transport.clearBreak();
    })
    .then(function(){
      transport.autoRecover = true;
      if(transport.isPaused()){
        return transport.unpause();
      }
    })
    .then(function(){
      return transport.flush();
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.exitProgramming = function(options, cb){
  var self = this;
  var transport = this._transport;

  if(typeof options === 'function'){
    cb = options;
    options = {};
  }else{
    options = options || {};
  }

  var promise = this.signoff()
    .then(function(){
      self._terminal.clearIgnore();
      if(!options.keepOpen){
        return transport.close();
      }
      if(options.listen){
        return self.listenPort();
      }
    })
    .otherwise(function(err){
      //close socket
      return transport.close()
        .then(function(){
          throw err;
        });
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype._emitData = function _emitData(chunk){
  this.emit('terminal', this._terminal.parseStreamChunk(chunk));
};

Protocol.prototype.listenPort = function listenPort(cb){
  this.on('data', this._emitData.bind(this));

  return nodefn.bindCallback(when.resolve(), cb);
};

Protocol.prototype.send = function send(data, cb){
  var self = this;

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

  this.on('data', onChunk);

  this._transport.send(data)
    .catch(defer.reject);

  var promise = defer.promise.finally(function(){
    self.removeListener('data', onChunk);
  });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.write = function(data, cb){
  var transmitEvents = this._transmit.parseStreamChunk(data);
  this.emit('transmit', transmitEvents);

  if(!this._options.echo){
    this._terminal.ignore(data);
  }
  var promise = this._transport.send(data);

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.reset = function reset(cb){
  var transport = this._transport;

  var promise = transport.set({ dtr: true })
    .delay(2)
    .then(function(){
      return transport.set({ dtr: false });
    });

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.signoff = function signoff(cb){
  var signoffBit = new Buffer([0]);

  var promise = this._transport.send(signoffBit);

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.setEcho = function setEcho(echo){
  this._options.echo = echo;
  this._terminal.clearIgnore();
};

Protocol.listPorts = function(cb){
  //TODO Refactor listPorts call in bs2-serial to break serial-protocol dependency chain
  return nodefn.bindCallback(Transport.listPorts(), cb);
};

module.exports = Protocol;
