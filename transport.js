'use strict';

var _ = require('lodash');
var util = require('util');
var when = require('when');
var EventEmitter = require('events').EventEmitter;

function resolveCallback(resolve, reject){
  return function(result){
    if(chrome.runtime.lastError){
      console.log('error', chrome.runtime.lastError);
      reject(new Error(chrome.runtime.lastError.message));
    }else{
      resolve(result);
    }
  };
}

function promisify(api){
  return _.reduce(api, function(result, method, name){
    if(_.isFunction(method)){
      result[name] = function(){
        var args = _.toArray(arguments);
        return when.promise(function(resolve, reject){
          method.apply(api, args.concat(resolveCallback(resolve, reject)));
        });
      };
    }
    return result;
  }, {});
}

var serial = promisify(chrome.serial);

function toBuffer(ab) {
  var buffer = new Buffer(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
      buffer[i] = view[i];
  }
  return buffer;
}

// Convert string to ArrayBuffer
function str2ab(str) {
  var buf = new ArrayBuffer(str.length);
  var bufView = new Uint8Array(buf);
  for (var i = 0; i < str.length; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

// Convert buffer to ArrayBuffer
function buffer2ArrayBuffer(buffer) {
  var buf = new ArrayBuffer(buffer.length);
  var bufView = new Uint8Array(buf);
  for (var i = 0; i < buffer.length; i++) {
    bufView[i] = buffer[i];
  }
  return buf;
}


function Transport(options) {
  EventEmitter.call(this);

  this._connectionId = -1;
  this._paused = false;
  this.autoRecover = true;

  this._closing = false;
  this._resuming = false;

  if(!options.path){
    throw new Error('Not path in Transport options');
  }

  this._options = _.cloneDeep(options);

  this.onError = this._onError.bind(this);
  this.onReceive = this._onReceive.bind(this);
}

util.inherits(Transport, EventEmitter);

Transport.prototype._onReceive = function onReceive(info){
  this.emit('data', toBuffer(info.data));
};

Transport.prototype._onError = function onError(err){
  var self = this;
  console.log('onReceiveError', err, chrome.runtime.lastError, this._connectionId);

  switch(err.error){
    case 'disconnected':
    case 'device_lost':
      if(self._connectionId >= 0){
        //hard error, close connection
        self.close();
      }
      break;
    case 'timeout':
      //ignore, timeout will not pause connection
      break;
    case 'frame_error':
    case 'system_error':
    case 'overrun':
    case 'buffer_overflow':
    case 'parity_error':
    case 'break':
      self._paused = true;
      if(self.autoRecover){
        //attempt to unpause automatically
        self.unpause();
      }
      break;
  }
};

Transport.prototype.isOpen = function isOpen(){
  return this._connectionId >= 0;
};

Transport.prototype.isPaused = function isPaused(){
  return this._paused;
};

Transport.prototype.open = function(){
  if(this.isOpen()){
    return when.resolve(true);
  }

  var self = this;
  var path = this._options.path;
  var opts = {
    bitrate: this._options.baudrate || 9600
  };

  return serial.connect(path, opts)
    .then(function(connInfo){
      self._closing = false;
      self._connectionId = connInfo.connectionId;
      chrome.serial.onReceiveError.addListener(self.onError);
      chrome.serial.onReceive.addListener(self.onReceive);
      self.emit('open');
    });
};

Transport.prototype.close = function(){
  var self = this;

  self._closing = serial.disconnect(self._connectionId)
    .ensure(function(){
      self._closing = false;
      self._connectionId = -1;
      chrome.serial.onReceiveError.removeListener(self.onError);
      chrome.serial.onReceive.removeListener(self.onReceive);
      self.emit('close');
    });

  return self._closing;
};

Transport.prototype.set = function(options){
  return serial.setControlSignals(this._connectionId, options);
};

Transport.prototype.setBreak = function(){
  return serial.setBreak(this._connectionId);
};

Transport.prototype.clearBreak = function(){
  return serial.clearBreak(this._connectionId);
};

Transport.prototype.flush = function(){
  return serial.flush(this._connectionId);
};

Transport.prototype.pause = function(){
  var self = this;
  return serial.setPaused(self._connectionId, true)
    .then(function(){
      self._paused = true;
      self._resuming = false;
    });
};

Transport.prototype.unpause = function(){
  var self = this;
  self._resuming = serial.setPaused(self._connectionId, false)
    .then(function(){
      self._paused = false;
      self._resuming = false;
    });
  return self._resuming;
};

Transport.prototype.send = function write(data){
  var self = this;

  if (typeof data === 'string') {
    data = str2ab(buffer);
  }
  if (data instanceof ArrayBuffer === false) {
    data = buffer2ArrayBuffer(data);
  }

  return serial.send(self._connectionId, data);
};

Transport.listPorts = function(){
  return serial.getDevices()
    .then(function(devices){
      return _.pluck(devices, 'path');
    });
};

module.exports = Transport;
