// document.querySelector('input').addEventListener('change', extractFrames, false);
document.querySelector('video').addEventListener('loadeddata', extractFrames, false);

function extractFrames() {
  var video = document.querySelector('#v');
  var array = [];
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var pro = document.querySelector('#progress');

  async function initCanvas(e) {
    canvas.width = this.videoWidth;
    canvas.height = this.videoHeight;
    console.log('canvas init', canvas);

  }

  async function drawFrame(e) {

    ctx.drawImage(this, 0, 0, canvas.width, canvas.height);
    firstData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    await merge(firstData,currentData);

    //TODO
    canvas.toBlob(saveFrame, 'image/png');
    pro.innerHTML = ((this.currentTime / this.duration) * 100).toFixed(2) + ' %';
    
    if (this.currentTime < this.duration) {
      await this.pause();
      await nextFrame(this.currentTime);
      await this.play();
    }
  }

  function merge(firstData,currentData) {
    var mix = document.createElement('canvas');
    var ctxMix = mix.getContext('2d');
    var limit = firstData.data.length/4;
    for (var i = 0; i < limit; i++) {

      let g = firstData.data[i * 4 + 1];
      let r = firstData.data[i * 4 + 0];
      let b = firstData.data[i * 4 + 2];

      let g2 = currentData.data[i * 4 + 1];
      let r2 = currentData.data[i * 4 + 0];
      let b2 = currentData.data[i * 4 + 2];

      if (g === g2 && r === r2 && b === b2){
        firstData.data[i * 4 + 3] = 0;
        continue;
      } else {
        firstData[i] = currentData[i];

      }
      console.log('*');
      
      ctxMix.putImageData (firstData,0,0);
      ctxMix.drawImage(currentData,0,0);
      ctxMix.putImageData (currentData,0,0);
      document.body.appendChild(mix)
      // return firstData.data;
    }
  }

  function nextFrame(currentTime) {
    console.log('crt ', currentTime);
    return (currentTime += 1 / 2);

  }

  function saveFrame(blob) {
    array.push(blob);
  }

  function revokeURL(e) {
    URL.revokeObjectURL(this.src);

  }

  function onend(e) {
    var img;
    // do whatever with the frames
    console.log('ar_', array.length);

    for (var i = 0; i < array.length; i++) {
      console.log('i     ', i);
      img = new Image();
      img.onload = revokeURL;
      img.src = URL.createObjectURL(array[i]);
      document.body.appendChild(img);
    }
    // we don't need the video's objectURL anymore
    URL.revokeObjectURL(this.src);

  }

  var firstData;
  video.muted = true;

  video.addEventListener('onloadeddata', initCanvas, false);
  video.addEventListener('timeupdate', drawFrame, false);
  // video.addEventListener('seeked', drawFrame, false);
  video.addEventListener('ended', onend, false);

  // video.src = URL.createObjectURL(this.files[0]);
  // video.play();
}