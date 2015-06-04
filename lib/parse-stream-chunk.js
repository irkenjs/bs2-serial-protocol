'use strict';

var eventCodes = {
  0: 'clear-screen',
  1: 'cursor-home',
  3: 'cursor-left',
  4: 'cursor-right',
  5: 'cursor-up',
  6: 'cursor-down',
  7: 'speaker-beep',
  8: 'backspace',
  9: 'tab',
  10: 'linefeed',
  11: 'clear-eol',
  12: 'clear-below'
};

// NIY: args-based codes
// 2 - 'cursor-position' - x,y
// 14 - 'cursor-position-x' - x
// 15 - 'cursor-position-y' - y

function addTextEvent(eventList, text) {
  if(text.length > 0){
    eventList.push({
      type: 'text',
      data: text
    });
  }
}

function addEvent(eventList, type, data) {
  eventList.push({
    type: type,
    data: data
  });
}

module.exports = function parseStreamChunk(chunk){
  var events = [];
  //TODO extend into event-parsing module for console command codes.
  var str = '';
  for(var idx = 0; idx < chunk.length; idx++){
    var char = chunk[idx];
    if(char === 13){
      str += '\n';
    } else if(eventCodes[char] != null){
      // generate text event before we create the special event
      addTextEvent(events, str);
      str = '';
      addEvent(events, eventCodes[char]);
    } else {
      str += String.fromCharCode(char);
    }
  }
  addTextEvent(events, str);
  return events;
};
