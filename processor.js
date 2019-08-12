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

  changeVideo: function (path) {
    console.log('hello', path);
    document.getElementById("video").video.src = path.toString();
    document.getElementById("video").video.load();

  },

  doLoad: function () {
    this.video = document.getElementById("video");
    // this.video.setAttribute("hidden", true);
    this.c1 = document.getElementById("c1");
    this.ctx1 = this.c1.getContext("2d");
    this.c2 = document.getElementById("c2");
    this.ctx2 = this.c2.getContext("2d");
    this.mix = document.createElement('canvas');
    // this.mix.setAttribute("hidden", true);
    this.mix.width = this.c1.width;
    this.mix.height = this.c1.height;
    this.ctxMix = this.mix.getContext("2d");
    document.getElementById('canvasGroup').appendChild(this.mix);
    this.threshold = 35;
    this.finalImage = [];
    this.red = 128;
    this.gree = 128;
    this.blue = 128;
    this.alpha = 255;
    this.frameCount = 0;
    this.frameStatic = undefined;
    this.frameMix = undefined;
    if (this.video && this.video.readyState === 4) {
      // let loop = document.getElementById("video").getAttribute(loop).value;
    }

    let self = this;
    this.video.addEventListener("play", function () {
      self.width = self.video.videoWidth / 2;
      self.height = self.video.videoHeight / 2;
      self.computeFrame();
    }, false);

    this.video.addEventListener("seeked", function () {
      console.log("seeked at frame: ", self.frameCount);
      self.video.pause();
    }, false);
  },

  changeRed: function (value) {
    this.red = value;

  },

  changeGreen: function (value) {
    this.green = value;
  },

  changeBlue: function (value) {
    this.blue = value;
  },

  changeAlpha: function (value) {
    this.alpha = value;
  },

  changeLoop: function (loop) {
    console.log("loop?", loop);
    if (loop) {
      loop = false;
    } else {
      loop = true;
    }
    return loop
  },

  setFirstFrame: function () {
    return new Promise((res, rej) => {
      res(this.ctx1.drawImage(this.video, 0, 0, this.c1.width, this.c1.height), console.log("setFirstFrame"))
      rej("error setFirstFrame")
    })

  },

  getStaticFrame: function () {
    return new Promise((res, rej) => {
      res(this.frameStatic = this.ctx1.getImageData(0, 0, this.c1.width, this.c1.height), console.log("getStaticFrame"));
      rej("error getStaticFrame")
    })
  },

  getMixFrame: function () {
    return new Promise((res, rej) => {
      res(this.frameMix = this.ctx2.getImageData(0, 0, this.mix.width, this.mix.height), console.log("getMixedFrame"));
      rej("error getMixedFrame")
    })
  },

  displaySingleFrame: function () {
    return new Promise((res, rej) => {

      var context2 = this.ctx2;
      var mixContext = this.mix;
      var canvas2 = this.c2;
      res(sortItOutNow(context2,mixContext,canvas2), console.log("displaySingleFrame"))
      function sortItOutNow() {
        context2.drawImage(this.video, 0, 0, mixContext.width, mixContext.height);
        let frameMix = context2.getImageData(0, 0, mixContext.width, mixContext.height);
        img = new Image();
        pic = canvas2.toDataURL();
        img.src = pic;
        document.getElementById('canvasGroup').appendChild(img);
        console.log(document.getElementById('canvasGroup').appendChild(img));
        
      }
      rej("error displaySingleFrame")
    })
  },

  compare: function () {
    return new Promise((res, rej) => {
      
      res(compareOperation, console.log("compare"));
      function compareOperation() {
        let l = this.frameMix.data.length / 4;

        for (let i = 0; i < l; i++) {
          let r = this.frameMix.data[i * 4 + 0];
          let g = this.frameMix.data[i * 4 + 1];
          let b = this.frameMix.data[i * 4 + 2];

          let r2 = this.frameStatic.data[i * 4 + 0];
          let g2 = this.frameStatic.data[i * 4 + 1];
          let b2 = this.frameStatic.data[i * 4 + 2];

          if (r < (r2 + this.threshold) && r > (r2 - this.threshold)
            && g < (g2 + this.threshold) && g > (g2 - this.threshold)
            && b < (b2 + this.threshold) && b > (b2 - this.threshold)
          ) {
            this.frameMix.data[i * 4 + 0] = this.red;
            this.frameMix.data[i * 4 + 1] = this.green;
            this.frameMix.data[i * 4 + 2] = this.blue;
            this.frameMix.data[i * 4 + 3] = this.alpha;
          }
        }
      }
      rej("error compare")
    })
  },

  paintMix: function () {
    return new Promise((res, rej) => {

      res(this.ctxMix.putImageData(this.frameMix, 0, 0), console.log("paint mix"));
      rej("error compare")
    })
  },

  // passFrame: async function () {
  //   return new Promise((res, rej) => {

  //     function passFrameOperation() {
  //       if (this.video.currentTime < this.video.duration) {
  //         this.pushToFinal();
  //         this.passOneFrame();
  //         this.frameCount += .3;
  //         this.computeFrame();
  //       } else {
  //         console.log("video ended");
  //         this.logfinal();
  //       }
  //     }
  //     res(passFrameOperation, console.log("passFrame"));
  //     rej("error passFrame")
  //   })
  // },

  computeFrame: async function () {
    if (this.video.currentTime < 0.1) {

      await this.setFirstFrame();
    }
    await this.getStaticFrame();
    await this.getMixFrame();
    await this.displaySingleFrame();
    await this.compare();
    await this.paintMix();
    // await this.passFrame();
    if (this.video.currentTime < this.video.duration) {
      await this.pushToFinal();
      await this.passOneFrame();
      await this.moveFrameAhead();
      await this.computeFrame();
    } else {
      await this.logfinal();
    }
  },

  pushToFinal: function () {
    return new Promise((res, rej) => {

      res(pushToFinalOperation, console.log("pushToFinal"));
      function pushToFinalOperation() {
        let pic = new Image();
        pic = this.mix.toDataURL();
        this.finalImage.push(pic);
      }
      rej("error pushToFinal")
    })
  },

  passOneFrame: function () {
    return new Promise((res, rej) => {
      
      res(passOneFrameOperation, console.log("passOneFrame"));
      function passOneFrameOperation() {
        // this.video.play();
        // let self = this;
        // this.video.addEventListener('canplay', function () {
        //   self.currentTime = self.frameCount / self.video.duration;
        //   console.log("passing to ", this.video.currentTime, "  duration : ", this.video.duration);
        // });
      }

      rej("error passOneFrame")
    })
  },

  moveFrameAhead: function () {
    return new Promise((res, rej) => {
      res(this.frameCount += .8, console.log("moveFrameAhead",this.frameCount,this.video.currentTime ));
      rej("error moveFrameAhead")
    })
  },

  revokeURL: function (e) {
    URL.revokeObjectURL(this.src);
  },

  logfinal: function () {
    return new Promise((res, rej) => {

      function logFinalOperation() {
        for (let i = 0; i < this.finalImage.length; i += 2) {
          console.log('logFinal i:', i);
          img = new Image();
          img.src = this.finalImage[i].toString();
          document.getElementById('canvasGroup').appendChild(img);
          console.log(document.getElementById('canvasGroup'), img);
        }
        console.log('fin');
      }
      res(logFinalOperation, console.log("logFinalOperation"));
      rej("error logFinalOperation")
    })
  }
}

document.addEventListener("DOMContentLoaded", () => {
  processor.doLoad();
});

document.getElementById('video').addEventListener("ended", () => {
  processor.logfinal();
});

document.getElementById('video').addEventListener("loaded", () => {
  processor.doLoad();
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

document.getElementById("alpha-slider").addEventListener("change", () => {
  processor.changeBlue(document.getElementById("alpha-slider").value);
});

document.getElementById("loop-checkbox").addEventListener("change", () => {
  console.log(document.getElementById("video").getAttribute("loop"));
  document.getElementById("video").setAttribute("loop", processor.changeLoop(document.getElementById("video").getAttribute("loop")))
});

document.getElementById("play-button").addEventListener("click", () => {
  processor.computeFrame();
});
