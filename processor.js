let processor = {
  timerCallback: function() {
    if (this.video.paused || this.video.ended) {
      return;
    }
    this.computeFrame();
    let self = this;
    setTimeout(function () {
        self.timerCallback();
      }, 0);
  },

  doLoad: function() {
    this.video = document.getElementById("video");
    this.c1 = document.getElementById("c1");
    // this.c1.width = this.video.videoWidth;
    // this.c1.height = this.video.videoHeight;
    this.ctx1 = this.c1.getContext("2d");
    this.getFrame();
    this.c2 = document.getElementById("c2");
    this.ctx2 = this.c2.getContext("2d");

    this.mix = document.createElement('canvas');
    this.mix.width =  this.c1.width;
    this.mix.height =  this.c1.height;
    document.getElementById('canvasGroup').appendChild(this.mix);
    this.ctxMix = this.mix.getContext("2d");

    let self = this;
    this.video.addEventListener("play", function() {
        self.width = self.video.videoWidth / 2;
        self.height = self.video.videoHeight / 2;
        self.timerCallback();
      }, false);
  },

  getFrame(){
    console.log(this.video);   
    // this.ctx1.drawImage(this.video, 0, 0,this.c1.width, this.c1.height); 
    console.log(this.ctx1);
  },

  computeFrame: function() {    
    if (this.video.currentTime <0.1){this.ctx1.drawImage(this.video, 0, 0,this.c1.width, this.c1.height);}
    let frameStatic = this.ctx1.getImageData(0, 0, this.video.videoWidth, this.video.videoHeight);
    
    this.ctxMix.drawImage(this.video, 0, 0,this.mix.width, this.mix.height);
    let frameMix = this.ctxMix.getImageData(0, 0, this.video.videoWidth, this.video.videoHeight);

    let l = frameMix.data.length / 4;
    for (let i = 0; i < l; i++) {
      let r = frameMix.data[i * 4 + 0];
      let g = frameMix.data[i * 4 + 1];
      let b = frameMix.data[i * 4 + 2];

      let g2 = frameStatic.data[i * 4 + 1];
      let r2 = frameStatic.data[i * 4 + 0];
      let b2 = frameStatic.data[i * 4 + 2];


      // if (g === g2 && r === r2 && b === b2){
      //   frame.data[i * 4 + 3] = 0;
      //   continue;
      // } else {
        
      // }
      frameStatic[i] = frameMix[i];
    }

    this.ctx2.putImageData(frameMix, 0, 0);
    return;
  }
};

document.addEventListener("DOMContentLoaded", () => {
processor.doLoad();
});








    // const frameRate = 25;
    // var frameNumber = Math.floor(this.video.currentTime * frameRate);
    // console.log(frameNumber);