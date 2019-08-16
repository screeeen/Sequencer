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
    //canvas
    this.video = document.getElementById("video");
    this.c1 = document.getElementById("c1");
    this.ctx1 = this.c1.getContext("2d");
    this.c2 = document.getElementById("c2");
    this.ctx2 = this.c2.getContext("2d");
    //create mix
    this.mix = document.createElement('canvas');
    this.mix.id = "mix";
    this.mix.width = this.c1.width;
    this.mix.height = this.c1.height;
    this.ctxMix = this.mix.getContext("2d");
    document.getElementById('canvasGroup').appendChild(this.mix);
    //image componentes
    this.threshold = 22;
    this.finalImage = [];
    this.red = 255;
    this.green = 255;
    this.blue = 255;
    this.alpha = 0;
    this.frameStatic = undefined;
    this.frameMix = undefined;

    let self = this;
    this.video.addEventListener("play", function () {
      self.width = self.video.videoWidth / 2;
      self.height = self.video.videoHeight / 2;
      self.timerCallback();
    }, false);
  },

  computeFrame: async function () {

    if (this.video.currentTime < 0.1) {
      await this.setFirstFrame();
      await this.getStaticFrame();
    }
    await this.getMixFrame();
    await this.displaySingleFrame();
    await this.compare();
    await this.paintMix();
    // if (this.video.currentTime < this.video.duration) {
    //   console.log("here!", this.video.currentTime);
    console.log("time", this.video.currentTime)
    await this.pushImageToArray();
    if (this.video.currentTime >= this.video.duration) {
      this.video.pause();
      // await this.logfinal();
      // await this.mixfinal();
      await this.mixFinalDif();
      return;
    }
    // await this.moveFrameAhead();
    // this.computeFrame();
    // } else {
    // }
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
      res(sortItOutNow(context2, mixContext, canvas2), console.log("displaySingleFrame"))
      function sortItOutNow() {
        context2.drawImage(this.video, 0, 0, mixContext.width, mixContext.height);
        // let frameMix = context2.getImageData(0, 0, mixContext.width, mixContext.height);
        // img = new Image();
        // pic = canvas2.toDataURL();
        // img.src = pic;
        // document.getElementById('canvasGroup').appendChild(img);
        // console.log(document.getElementById('canvasGroup').appendChild(img));

      }
      rej("error displaySingleFrame")
    })
  },

  compare: function () {
    return new Promise((res, rej) => {
      var frameMixOp = this.frameMix;
      var frameStaticOp = this.frameStatic;
      var thresholdOp = this.threshold;
      var redOp = this.red;
      var blueOp = this.blue;
      var greenOp = this.green;
      var alphaOp = this.alpha;

      res(compareOperation(frameMixOp, frameStaticOp, thresholdOp, redOp, blueOp, greenOp, alphaOp), console.log("compare"));
      function compareOperation() {
        let l = frameMixOp.data.length / 4;

        for (let i = 0; i < l; i++) {
          let r = frameMixOp.data[i * 4 + 0];
          let g = frameMixOp.data[i * 4 + 1];
          let b = frameMixOp.data[i * 4 + 2];

          let r2 = frameStaticOp.data[i * 4 + 0];
          let g2 = frameStaticOp.data[i * 4 + 1];
          let b2 = frameStaticOp.data[i * 4 + 2];

          if (r < (r2 + thresholdOp) && r > (r2 - thresholdOp)
            && g < (g2 + thresholdOp) && g > (g2 - thresholdOp)
            && b < (b2 + thresholdOp) && b > (b2 - thresholdOp)
          ) {
            frameMixOp.data[i * 4 + 0] = redOp;
            frameMixOp.data[i * 4 + 1] = greenOp;
            frameMixOp.data[i * 4 + 2] = blueOp;
            frameMixOp.data[i * 4 + 3] = alphaOp;
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

  moveFrameAhead: function () {
    return new Promise((res, rej) => {
      res(this.video.currentTime += .02,
        this.video.addEventListener("seeked", res, false), console.log("moveFrameAhead", this.video.currentTime));
      rej("error moveFrameAhead")
    })
  },

  pushImageToArray: function () {
    return new Promise((res, rej) => {

      var mixOp = this.mix;
      var finalImageOp = this.finalImage;
      res(pushToFinalOperation(mixOp, finalImageOp), console.log("pushToFinal"));
      function pushToFinalOperation() {
        let pic = new Image();
        pic = mixOp.toDataURL();
        finalImageOp.push(pic);
      }
      rej("error pushToFinal")
    })
  },

  logfinal: function () {
    return new Promise((res, rej) => {
      var finalImageOp = this.finalImage;
      res(logFinalOperation(), console.log("logFinalOperation"));
      function logFinalOperation() {
        for (let i = 1; i < finalImageOp.length; i += 2) {
          // console.log('logFinal i:', i, finalImageOp[i].toString());
          img = new Image();
          img.src = finalImageOp[i].toString();
          document.getElementById('canvasGroup').appendChild(img);
        }
      }
      rej("error logFinalOperation")
    })
  },

  mixFinalDif: function () {
    return new Promise((res, rej) => {
      console.log("lenght of images array", this.finalImage.length);
      var finalImageOp = this.finalImage;
      var secondCanvas = this.c2;
      var secondCanvasCtx = secondCanvas.getContext('2d');
      var thirdCanvas = this.mix;
      var thirdCanvasCtx = thirdCanvas.getContext('2d');
      var imageDataMix = thirdCanvasCtx.getImageData(0, 0, thirdCanvas.width, thirdCanvas.height);

      res(mixfinalOperationD(), console.log("mixFinalDiff"));

      function mixfinalOperationD() {
        for (let x = 0; x < finalImageOp.length; x += 1) {

          var img = new Image();
          img.src = finalImageOp[x];
          secondCanvasCtx.drawImage(img, 0, 0);
          var imageDataSecond = secondCanvasCtx.getImageData(0, 0, secondCanvas.width, secondCanvas.height);
          var pixelsSecond = imageDataSecond.data;

          img = new Image();
          img.src = finalImageOp[x].toString();
          document.getElementById('canvasGroup').appendChild(img);



          // var cv = document.createElement('canvas');
          // cv.id = 'manolo';
          // var cvx = cv.getContext('2d');
          // var imgxx = new Image();
          // imgxx.src = finalImageOp[x];
          // cvx.drawImage(imgxx, 0, 0);
          // document.getElementById('canvasGroup').appendChild(cv);


          for (let i = 1; i < pixelsSecond.length; i += 1) {
            let r = pixelsSecond[i];
            // let g = pixelsSecond[i];
            // let b = pixelsSecond[i];

            let rp = pixelsSecond[0];
            // let gp = pixelsSecond[1];
            // let bp = pixelsSecond[2];

            if (r === rp) {
              continue;
            } else {
              imageDataMix.data[i] = r;
              // imageDataMix.data[i] = g;
              // imageDataMix.data[i] = b; 
              // imageDataMix.data[i] = 255;
            }
          }
          // thirdCanvasCtx.save()
          // thirdCanvasCtx.globalCompositeOperation="destination-atop";
          // thirdCanvasCtx.putImageData(imageDataMix, 0, 0);
          // thirdCanvasCtx.restore()
        }
        console.log(imageDataMix.data);
        thirdCanvasCtx.putImageData(imageDataMix, 0, 0);

      }
      rej("error mixFinalOperation")
    })
  },

  mixfinal: function () {
    return new Promise((res, rej) => {
      console.log("lenght of images array", this.finalImage.length);

      var finalImageOp = this.finalImage;
      var firstCanvas = this.c1;
      var secondCanvas = this.c2;
      var thirdCanvas = this.mix;
      var thresholdOp = 20;//this.threshold;

      res(mixfinalOperation(), console.log("mixFinal"));

      function mixfinalOperation() {
        var firstCanvasCtx = firstCanvas.getContext('2d');
        // var firstCanvasCtxData = firstCanvasCtx.getImageData(0, 0, firstCanvas.width, firstCanvas.height)
        var secondCanvasCtx = secondCanvas.getContext('2d');
        // var secondCanvasCtxData = secondCanvasCtx.getImageData(0, 0, secondCanvas.width, secondCanvas.height)
        var thirdCanvasCtx = thirdCanvas.getContext('2d');
        // var thirdCanvasCtxData = thirdCanvasCtx.getImageData(0, 0, thirdCanvas.width, thirdCanvas.height)

        //grab fixed image mix canvas
        var imageDataFirst = firstCanvasCtx.getImageData(0, 0, firstCanvas.width, firstCanvas.height);
        var imageDataMix = thirdCanvasCtx.getImageData(0, 0, thirdCanvas.width, thirdCanvas.height);

        var count = 0;
        for (let x = 0; x < finalImageOp.length; x += 4) {
          // console.log(x, "-------------------------------------------------")

          //grab dinamic image
          var img = new Image();
          img.src = finalImageOp[x];
          secondCanvasCtx.drawImage(img, 0, 0);
          var imageDataSecond = secondCanvasCtx.getImageData(0, 0, secondCanvas.width, secondCanvas.height);
          var pixelsSecond = imageDataSecond.data;

          for (let i = count; i < pixelsSecond.length; i += 1) {

            let rMix = imageDataFirst.data[i * 4 + 0];
            let gMix = imageDataFirst.data[i * 4 + 1];
            let bMix = imageDataFirst.data[i * 4 + 2];

            let r2 = pixelsSecond[i * 4 + 0];
            let g2 = pixelsSecond[i * 4 + 1];
            let b2 = pixelsSecond[i * 4 + 2];

            if (r2 < (rMix + thresholdOp) && r2 > (rMix - thresholdOp)
              && g2 < (gMix + thresholdOp) && g2 > (gMix - thresholdOp)
              && b2 < (bMix + thresholdOp) && b2 > (bMix - thresholdOp)
            ) {
              // console.log("dif",rMix,r2);

              imageDataMix.data[i * 4 + 0] = r2;
              imageDataMix.data[i * 4 + 1] = 0;
              imageDataMix.data[i * 4 + 2] = 0;
              imageDataMix.data[i * 4 + 3] = 255;
              // console.log("count f", count);
            }
            count++;
          }
          thirdCanvasCtx.putImageData(imageDataMix, 0, 0);
        }

      }
      rej("error mixFinalOperation")
    })
  },

  //TOOLS components
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
  }
}

document.addEventListener("DOMContentLoaded", () => {
  processor.doLoad();
});

// document.getElementById('video').addEventListener("ended", () => {
//   processor.logfinal();
// });

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
  processor.changeAlpha(document.getElementById("alpha-slider").value);
});

document.getElementById("loop-checkbox").addEventListener("change", () => {
  console.log(document.getElementById("video").getAttribute("loop"));
  document.getElementById("video").setAttribute("loop", processor.changeLoop(document.getElementById("video").getAttribute("loop")))
});

document.getElementById("play-button").addEventListener("click", () => {
  processor.computeFrame();
});

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


      // if (this.video && this.video.readyState === 4) {
    //   let loop = document.getElementById("video").getAttribute(loop).value;
    // }

    // let self = this;
    // this.video.addEventListener("play", function () {
    //   self.width = self.video.videoWidth / 2;
    //   self.height = self.video.videoHeight / 2;
    //   self.computeFrame();
    // }, false);

    // this.video.addEventListener("seeked", function () {
    //   console.log("seeked at frame: ", self.frameCount);
    //   self.video.pause();
    // }, false);




