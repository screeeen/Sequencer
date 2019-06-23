'use strict'
    var video = document.createElement("video");
    // video.setAttribute("controls","");

    var canvas = document.getElementById("prevImgCanvas");
    canvas.width = window.innerWidth/2;
    canvas.height = window.innerHeight/2;

    video.addEventListener('loadeddata', function () {
      reloadRandomFrame();
    }, false);

    video.addEventListener('seeked', function () {
      var context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }, false);

    var playSelectedFile = function (event) {
      var file = this.files[0];
      var fileURL = URL.createObjectURL(file);
      video.src = fileURL;
    }

    var input = document.querySelector('input');
    input.addEventListener('change', playSelectedFile, false);

    function reloadRandomFrame() {
      if (!isNaN(video.duration)) {
        var rand = Math.round(Math.random() * video.duration * 1000) + 1;
        video.currentTime = rand / 1000;
      }
    }