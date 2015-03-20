//just the regular nodeserialport example with our added reset

'use strict';

var SerialPort = require('../');
var serialPort = new SerialPort('/dev/tty.usbmodem1411', {
  baudrate: 57600
}, false); // this is the openImmediately flag [default is true]

serialPort.open(function (error) {
  if ( error ) {
    console.log('failed to open: ' + error);
  } else {
    console.log('open');
    serialPort.on('data', function(data) {
      console.log('data received: ' + data);
    });

    var reset = function(){
      serialPort.reset(function(error) {
        console.log('reset', error);
      });
    };

    //test our added reset function
    //you get a reset for free on startup, so lets wait 5 seconds and do ours
    setTimeout(reset, 5000);

  }
});
