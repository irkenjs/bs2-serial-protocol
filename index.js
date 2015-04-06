'use strict';

var SerialPort = require('serialport').SerialPort;
var when = require('when');
var nodefn = require('when/node');

function Protocol(options){
  var self = this;

  //todo fail on no options.path

  var opts = options.options || { baudrate: 200 };

  this._serial = options.serialport || new SerialPort(options.path, opts, false);

  this._queue = null;

  this._serial.on('data', function(chunk){
    if(typeof self._queue === 'function'){
      self._queue(chunk);
    }
  });
}

//if opened before a bootload is attempted, opened at 200 intead of 9600
Protocol.prototype.open = function(options, cb){
  var serialport = this._serial;

  function _open(){
    return when.promise(function(resolve, reject) {
      serialport.open( function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function onChunk(data) {
    self.emit('data', data);
  }

  self._onResponse(onChunk);

  var promise = _open();
  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.close = function(cb){
  var serialport = this._serial;

  function _close(){
    return when.promise(function(resolve, reject) {
      serialport.close( function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  var promise = this.signoff()
    .then(_close());
  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.enterProgramming = function(cb){
  var serialport = this._serial;

  function _open(){
    return when.promise(function(resolve, reject) {
      serialport.open( function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  var promise = _open()
    .then(this.reset.bind(this));
  return nodefn.bindCallback(promise, cb);
};

Protocol.prototype.exitProgramming = function(cb){
  var serialport = this._serial;

  function _close(){
    return when.promise(function(resolve, reject) {
      serialport.close( function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  var promise = this.signoff()
    .then(_close());
  return nodefn.bindCallback(promise, cb);
};

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
