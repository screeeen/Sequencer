let processor = {
  timerCallback: function () {
    if (this.video.paused || this.video.ended) {
      return;
    }
    this.computeFrame();
    let self = this;
    setTimeout(function () {
      self.timerCallback();
    }, 0);
  },

  doLoad: function () {
    this.video = document.getElementById("video");
    // this.c1 = document.createElement("canvas").setAttribute("id","c1");
    this.c1 = document.getElementById("c1");
    this.ctx1 = this.c1.getContext("2d");
    this.c2 = document.getElementById("c2");
    this.ctx2 = this.c2.getContext("2d");
    this.mix = document.createElement('canvas');
    this.mix.width = this.c1.width;
    this.mix.height = this.c1.height;
    this.ctxMix = this.mix.getContext("2d");
    document.getElementById('canvasGroup').appendChild(this.mix);
    this.threshold = 45;

    let self = this;
    this.video.addEventListener("play", function () {
      self.width = self.video.videoWidth / 2;
      self.height = self.video.videoHeight / 2;
      self.timerCallback();
    }, false);
  },

  getFrame() {
    console.log(this.video);
    // this.ctx1.drawImage(this.video, 0, 0,this.c1.width, this.c1.height); 
    console.log(this.ctx1);
  },

  computeFrame: function () {
    if (this.video.currentTime < 0.1) { this.ctx1.drawImage(this.video, 0, 0, this.c1.width, this.c1.height); }
    let frameStatic = this.ctx1.getImageData(0, 0, this.c1.width, this.c1.height);

    this.ctx2.drawImage(this.video, 0, 0, this.mix.width, this.mix.height);
    let frameMix = this.ctx2.getImageData(0, 0, this.mix.width, this.mix.height);

    let l = frameMix.data.length / 4;
    for (let i = 0; i < l; i++) {
      let r = frameMix.data[i * 4 + 0];
      // let g = frameMix.data[i * 4 + 1];
      // let b = frameMix.data[i * 4 + 2];


      let r2 = frameStatic.data[i * 4 + 0];
      // let g2 = frameStatic.data[i * 4 + 1];
      // let b2 = frameStatic.data[i * 4 + 2];
      // frameStatic.data[i * 4 + 1] = 0;
      // frameStatic.data[i * 4 + 2] = 0;

      // if (g === g2 && r === r2 && b === b2) {
      if (r < (r2 + this.threshold) && r > (r2 - this.threshold)) {
        frameMix.data[i * 4 + 1] = 0;
        frameMix.data[i * 4 + 2] = 0;
        // frameMix.data[i * 4 + 3] = 0;
        continue;
      } else {
        // frameStatic.data[i * 4 + 0] = frameMix.data[i * 4 + 0];
        // frameStatic.data[i * 4 + 1] = frameMix.data[i * 4 + 1];
        // frameStatic.data[i * 4 + 2] = frameMix.data[i * 4 + 2];
        // console.table(frameStatic.data[i * 4 + 0]);

      }
    }

    this.ctxMix.putImageData(frameMix, 0, 0);
    return;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  processor.doLoad();
});








    // const frameRate = 25;
    // var frameNumber = Math.floor(this.video.currentTime * frameRate);
    // console.log(frameNumber);