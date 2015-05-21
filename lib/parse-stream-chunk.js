'use strict';

module.exports = function parseStreamChunk(chunk){
  //TODO extend into event-parsing module for console command codes.
  var str = '';
  for(var idx = 0; idx < chunk.length; idx++){
    var char = chunk[idx];
    if(char === 13){
      str += '\n';
    } else {
      str += String.fromCharCode(char);
    }
  }
  return {
    type: 'text',
    data: str
  };
};
