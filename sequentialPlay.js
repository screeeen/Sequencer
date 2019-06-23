document.addEventListener('DOMContentLoaded', function () {

  var v = document.getElementById('v');
  var canvas = document.getElementById('c');
  var context = canvas.getContext('2d');
  var back = document.createElement('canvas');
  var backcontext = back.getContext('2d');
  var canvasC = document.getElementById('ccc');
  var contextC = canvasC.getContext('2d');
  var cw, ch;


  v.addEventListener('play', function () {
    cw = v.clientWidth ;
    ch = v.clientHeight ;
    canvas.width = cw;
    canvas.height = ch;
    back.width = cw;
    back.height = ch;
    canvasC.width = cw;
    canvasC.height = ch;

    firstFrame(v, contextC, backcontext, cw, ch);
    accu(v, context, backcontext, cw, ch);

  }, false);
}, false);

let accuImages = [];
let accuData;
const threshold = 10;
let firstData;

function firstFrame(v, c, bc, cw, ch) {
  if (v.paused || v.ended) return false;
  bc.drawImage(v, 0, 0, cw, ch);
  firstData = bc.getImageData(0, 0, cw, ch);
  var data = firstData.data;
  firstData.data = data;
  c.putImageData(firstData, 0, 0);
  
}



let cont = 0;

function accu(v, c, bc, cw, ch) {
  if (v.paused || v.ended) return false;
  // First, draw it into the backing canvas
  bc.drawImage(v, 0, 0, cw, ch);
  var idata = bc.getImageData(0, 0, cw, ch);
  var data = idata.data;
  var limit = data.length;
  for (var i = 0; i < limit; i++) {
    if (data[i] !== firstData.data[i]) {
      firstData.data[i] = data[i];
      console.log('change ', firstData.data[i], '    ', i);
    }
  }
  // idata.data = data;
  // c.putImageData(idata, 0, 0);
  cont++;
  console.log('frame   ', cont);
  // setTimeout(accu, 20, v, c, bc, cw, ch);
}

document.addEventListener('keydown', logKey);

function logKey(e) {
  if (firstData.data.length > 0) {
    var canvasC = document.getElementById('ccc');
    var context = canvasC.getContext('2d');
    context.putImageData(firstData, 0, 0);
    console.log('ffffffff', firstData);

  }
}


function between(x, min, max) {
  return x >= min && x <= max;
}
