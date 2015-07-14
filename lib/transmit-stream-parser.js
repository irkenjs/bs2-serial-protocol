'use strict';

var eventCodes = {
  8: 'backspace'
};

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

function combineLinefeed(lastCode, code){
  return (lastCode === 10 && code === 13) || (lastCode === 13 && code === 10);
}

function StreamParser(){
  this.lastCode = null;
}

StreamParser.prototype.parseStreamChunk = function(chunk){
  var events = [];
  var str = '';
  for(var idx = 0; idx < chunk.length; idx++){
    var char = chunk[idx];
    if(combineLinefeed(this.lastCode, char)){
      this.lastCode = char;
      //do nothing, allow previous linefeed event to handle this
      continue;
    } else if(char === 10 || char === 13){
      str += '\n';
    } else if(eventCodes[char] != null){
      // finalize the current text event before we create the special event
      addTextEvent(events, str);
      str = '';
      addEvent(events, eventCodes[char]);
    } else if(char <= 31 || (char >= 128 && char <= 159)){
      str += ' ';
    } else {
      str += String.fromCharCode(char);
    }
    this.lastCode = char;
  }
  // finalize any trailing text into an event
  addTextEvent(events, str);
  return events;
};

module.exports = StreamParser;
