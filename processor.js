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
    this.video.setAttribute("hidden", true);
    this.c1 = document.getElementById("c1");
    this.ctx1 = this.c1.getContext("2d");
    this.c2 = document.getElementById("c2");
    this.ctx2 = this.c2.getContext("2d");
    this.mix = document.createElement('canvas');
    this.mix.setAttribute("hidden", true);
    this.mix.width = this.c1.width;
    this.mix.height = this.c1.height;
    this.ctxMix = this.mix.getContext("2d");
    document.getElementById('canvasGroup').appendChild(this.mix);
    this.threshold = 35;
    this.finalImage = [];
    this.red = 128;
    this.gree = 128;
    this.blue = 128;
    if (this.video.readyState === 4) {

      let loop = document.getElementById("video").getAttribute(loop).value;
    }

    let self = this;
    this.video.addEventListener("play", function () {
      self.width = self.video.videoWidth / 2;
      self.height = self.video.videoHeight / 2;
      self.timerCallback();
    }, false);

    this.video.addEventListener("seeked", function () {
      self.computeFrame();
    }, false);
  },

  changeRed: function (value) {
    this.red = value;
    this.computeFrame();

    console.log(this.red);
  },

  changeGreen: function (value) {
    this.green = value;
    this.computeFrame();

    console.log(this.green);
  },

  changeBlue: function (value) {
    this.blue = value;
    this.computeFrame();

    console.log(this.blue);
  },

  changeLoop: function (loop) {
    console.log("loop?", loop);
    if (loop) {
      loop = false;
    } else {
      loop = true;
    }
    // loop ? loop = true : loop = false;
    return loop
  },

  getFrame: function () {
    console.log(this.video);
    this.ctx1.drawImage(this.video, 0, 0, this.c1.width, this.c1.height);
    console.log(this.ctx1);
  },

  computeFrame: function () {
    if (this.video.currentTime < 0.1) { this.ctx1.drawImage(this.video, 0, 0, this.c1.width, this.c1.height); }
    let frameStatic = this.ctx1.getImageData(0, 0, this.c1.width, this.c1.height);
    this.ctx2.drawImage(this.video, 0, 0, this.mix.width, this.mix.height);

    pillar imagen de ctx2
    pushearla en finalImange, (y no los pixels)

    let frameMix = this.ctx2.getImageData(0, 0, this.mix.width, this.mix.height);
    let l = frameMix.data.length / 4;

    for (let i = 0; i < l; i++) {
      let r = frameMix.data[i * 4 + 0];
      let g = frameMix.data[i * 4 + 1];
      let b = frameMix.data[i * 4 + 2];

      let r2 = frameStatic.data[i * 4 + 0];
      let g2 = frameStatic.data[i * 4 + 1];
      let b2 = frameStatic.data[i * 4 + 2];

      if (r < (r2 + this.threshold) && r > (r2 - this.threshold)
        && g < (g2 + this.threshold) && g > (g2 - this.threshold)
        && b < (b2 + this.threshold) && b > (b2 - this.threshold)
      ) {
        frameMix.data[i * 4 + 0] = 0;
        frameMix.data[i * 4 + 1] = 0;
        frameMix.data[i * 4 + 2] = 0;
        frameMix.data[i * 4 + 3] = 0;

        // frameMix.data[i * 4 + 0] = this.red;
        // frameMix.data[i * 4 + 1] = this.green;
        // frameMix.data[i * 4 + 2] = this.blue;
        // frameMix.data[i * 4 + 3] = 0;
        // console.log('*');

        this.finalImage.push(frameMix.data);
        continue;
      } else {
        // frameMix.data[i * 4 + 0] = 0;
        // frameMix.data[i * 4 + 1] = 0;
        // frameMix.data[i * 4 + 2] = 0;
        // frameMix.data[i * 4 + 3] = 0;
      }
    }
    this.ctxMix.putImageData(frameMix, 0, 0);
    return;
  },

  logfinal: function () {
    console.log('seq:');
    for (let i = 0; i < this.finalImage.length; i += 88) {
      console.log('hola', typeof this.finalImage[i]);
      // let canvas = document.getElementById('c2');
      // let dataURL = canvas.toDataURL('image/png,0.1');
      // let pic = document.createElement('img').src = dataURL;
      // document.getElementById('canvasGroup').appendChild(this.mix);
      this.c = document.createElement('canvas');
      // this.mix.width = this.c1.width;
      // this.mix.height = this.c1.height;
      this.ct = this.c.getContext("2d");
      // this.ct.drawImage(this.finalImage[i].getImageData(0,0),0,0)
      document.getElementById('canvasGroup').appendChild(this.c);


    }
    console.log('fin');
  }
}

document.addEventListener("DOMContentLoaded", () => {
  processor.doLoad();
});

document.getElementById('video').addEventListener("ended", () => {
  processor.logfinal();
});

document.getElementById("red-slider").addEventListener("change", () => {
  processor.changeRed(document.getElementById("red-slider").value);
});

document.getElementById("green-slider").addEventListener("change", () => {
  processor.changeGreen(document.getElementById("green-slider").value);
});


document.getElementById("blue-slider").addEventListener("change", () => {
  processor.changeBlue(document.getElementById("blue-slider").value);
});

document.getElementById("loop-checkbox").addEventListener("change", () => {
  // let loop = document.getElementById("video").getAttribute(loop).value;
  console.log(document.getElementById("video").getAttribute("loop"));
  document.getElementById("video").setAttribute("loop", processor.changeLoop(document.getElementById("video").getAttribute("loop")))
});

document.getElementById("play-button").addEventListener("click", () => {
  console.log(document.getElementById("video"));
  document.getElementById("video").play();
});













    // const frameRate = 25;
    // var frameNumber = Math.floor(this.video.currentTime * frameRate);
    // console.log(frameNumber);