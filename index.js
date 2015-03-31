'use strict';

var SerialPort = require('serialport').SerialPort;
var when = require('when');
var nodefn = require('when/node');

function Protocol(options){
  var self = this;

  this._serial = options.serialport || new SerialPort(options.path, options.options);

  this._queue = null;

  this._serial.on('data', function(chunk){
    if(typeof self._queue === 'function'){
      self._queue(chunk);
    }
  });
}

Protocol.prototype._onResponse = function(fn){
  this._queue = fn;
};

Protocol.prototype.send = function send(data, cb){
  var self = this;
  var serial = this._serial;

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
  var serial = this._serial;

  function setDtr(){
    return when.promise(function(resolve, reject) {
      serial.set({dtr: false}, function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function clrDtr(){
    return when.promise(function(resolve, reject) {
      serial.set({dtr: true}, function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function setBrk(){
    return when.promise(function(resolve, reject) {
      serial.write(new Buffer([0x00]), function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function clrBrk(){
    return when.promise(function(resolve, reject) {
      serial.update({baudRate: 9600}, function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  var promise = setBrk()
    .then(setDtr)
    .delay(2)
    .then(clrDtr)
    .delay(100) //need to wait for the setbrk byte to get out on the line
    .then(clrBrk);

  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.signoff = function signoff(cb){
  var serial = this._serial;

  var promise = when.promise(function(resolve, reject) {
    serial.write(new Buffer([0]), function(err){
      if(err){ return reject(err); }
      return resolve();
    });
  });

  return nodefn.bindCallback(promise, cb);
};

module.exports = Protocol;
