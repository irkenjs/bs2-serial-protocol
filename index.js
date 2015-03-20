'use strict';

var SerialPort = require('serialport').SerialPort;
var when = require('when');
var nodefn = require('when/node');
var util = require('util');

function BS2SP(path, options, openImmediately, callback){
  SerialPort.call(this, path, options, openImmediately, callback);
}
util.inherits(BS2SP, SerialPort);


BS2SP.prototype.reset = function reset(cb){
  var self = this;

  function setDtr(){
    return when.promise(function(resolve, reject) {
      self.set({dtr: false}, function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function clrDtr(){
    return when.promise(function(resolve, reject) {
      self.set({dtr: true}, function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function setBrk(){
    return when.promise(function(resolve, reject) {
      self.write(new Buffer([0x00]), function(err){
        if(err){ return reject(err); }
        return resolve();
      });
    });
  }

  function clrBrk(){
    return when.promise(function(resolve, reject) {
      self.update({baudRate: 9600}, function(err){
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

module.exports = BS2SP;
