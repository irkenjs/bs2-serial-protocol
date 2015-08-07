'use strict';

var eventCodes = {
  0: 'clear-screen',
  1: 'cursor-home',
  2: {
    type: 'cursor-position',
    args: 2
  },
  3: 'cursor-left',
  4: 'cursor-right',
  5: 'cursor-up',
  6: 'cursor-down',
  7: 'speaker-beep',
  8: 'backspace',
  9: 'tab',
  10: 'linefeed',
  11: 'clear-eol',
  12: 'clear-below',
  13: 'linefeed',
  14: {
    type: 'cursor-position-x',
    args: 1
  },
  15: {
    type: 'cursor-position-y',
    args: 1
  },
  16: 'clear-screen'
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
  this.partial = null;
  this.lastCode = null;
}

StreamParser.prototype.parseStreamChunk = function(chunk){
  var events = [];
  var str = '';
  for(var idx = 0; idx < chunk.length; idx++){
    var char = chunk[idx];
    if(this.partial != null){
      this.partial.data.push(char);
      if(this.partial.data.length >= this.partial.args){
        events.push(this.partial);
        this.partial = null;
      }
    }else if(combineLinefeed(this.lastCode, char)){
      //do nothing, allow previous linefeed event to handle this
      //set lastCode to nothing so it won't accidentally filter repeating cases:
      // LF, CR, LF, CR
      this.lastCode = null;
      continue;
    }else if(eventCodes[char] != null){
      // finalize the current text event before we create the special event
      addTextEvent(events, str);
      str = '';
      this.handleEvent(events, eventCodes[char]);
    } else {
      str += String.fromCharCode(char);
    }
    this.lastCode = char;
  }
  // finalize any trailing text into an event
  addTextEvent(events, str);
  return events;
};

StreamParser.prototype.handleEvent = function(eventList, evt){
  if(typeof evt === 'string'){
    addEvent(eventList, evt);
  }else{
    this.partial = {
      type: evt.type,
      data: [],
      args: evt.args
    };
  }
};

module.exports = StreamParser;
