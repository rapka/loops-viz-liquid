import React from 'react';
import PropTypes from 'prop-types';
import sum from 'lodash/sum';

import config from './config';

import './Scope.css';


var Loader = require('./js/src/engine/loader');
var Clock = require('./js/src/engine/clock').Clock;
var InputHandler = require('./js/src/engine/input').Handler;
var debounce = require('./js/src/engine/utils').debounce;
var ShaderManager = require('./js/src/engine/gl/shader').Manager;
var geometry = require('./js/src/engine/gl/geometry');
var FBO = require('./js/src/engine/gl/texture').FBO;
var Mesh = require('./js/src/engine/gl/mesh').Mesh;
var glcontext = require('./js/src/engine/gl/context');
var vec2 = require('./js/src/gl-matrix').vec2;
var ComputeKernel = require('./js/src/compute').Kernel;


let WIDTH = 1920 / 2;
let HEIGHT = 1080;

console.log('requiring');
require('./js/src/game-shim');
console.log('requiring done');

var renderBlood = true;

var intervalID;
window.audioBufferSouceNode = null;
var offset = 0;
var startTime = 0;
var paused = false;
var tickCounter = 0;

var playing = false;
var bloodHeight = 20;
var bloodPower = 20;
var bloodWidth = 20;
var bloodCursor = 80;
var options = {
  iterations: 18,
  mouse_force: 10,
  resolution: 0.5,
  cursor_size: 80,
  step: 1/60
};

var mouseX = null;
var mouseY = null;

var canvas = document.getElementById('c');
var gl = glcontext.initialize(canvas, {
    context: {
      depth: false
    },
    debug: false,
    //log_all: true,
    extensions: {
      texture_float: true
    }
  }, fail);
var clock = new Clock(canvas);
var input = new InputHandler(canvas);
var loader = new Loader();
var resources = loader.resources;
var shaders = new ShaderManager(gl, resources);

window.gl = gl;

function hasFloatLuminanceFBOSupport(){
  var fbo = new FBO(gl, 32, 32, gl.FLOAT, gl.LUMINANCE);
  return fbo.supported;
}

function setup(width, height, singleComponentFboFormat){
  canvas.width = width;
  canvas.height = height;

  gl.viewport(0, 0, width, height);
  gl.lineWidth(1.0);

  var px_x = 1.0/canvas.width;
  var px_y = 1.0/canvas.height;
  var px = vec2.create([px_x, px_y]);
  var px1 = vec2.create([1, canvas.width/canvas.height]);
  var inside = new Mesh(gl, {
      vertex: geometry.screen_quad(1.0-px_x*2.0, 1.0-px_y*2.0),
      attributes: {
        position: {}
      }
    }),
    all = new Mesh(gl, {
      vertex: geometry.screen_quad(1.0, 1.0),
      attributes: {
        position: {}
      }
    }),
    boundary = new Mesh(gl, {
      mode: gl.LINES,
      vertex: new Float32Array([
        // bottom
        -1+px_x*0.0, -1+px_y*0.0,
        -1+px_x*0.0, -1+px_y*2.0,

         1-px_x*0.0, -1+px_y*0.0,
         1-px_x*0.0, -1+px_y*2.0,

        // top
        -1+px_x*0.0,  1-px_y*0.0,
        -1+px_x*0.0,  1-px_y*2.0,

         1-px_x*0.0,  1-px_y*0.0,
         1-px_x*0.0,  1-px_y*2.0,

        // left
        -1+px_x*0.0,  1-px_y*0.0,
        -1+px_x*2.0,  1-px_y*0.0,

        -1+px_x*0.0, -1+px_y*0.0,
        -1+px_x*2.0, -1+px_y*0.0,

        // right
         1-px_x*0.0,  1-px_y*0.0,
         1-px_x*2.0,  1-px_y*0.0,

         1-px_x*0.0, -1+px_y*0.0,
         1-px_x*2.0, -1+px_y*0.0

      ]),
      attributes: {
        position: {
          size: 2,
          stride: 16,
          offset: 0
        },
        offset: {
          size: 2,
          stride: 16,
          offset: 8
        }
      }
    });
  var velocityFBO0 = new FBO(gl, width, height, gl.FLOAT);
  var velocityFBO1 = new FBO(gl, width, height, gl.FLOAT);
  var divergenceFBO = new FBO(gl, width, height, gl.FLOAT, singleComponentFboFormat);
  var pressureFBO0 = new FBO(gl, width, height, gl.FLOAT, singleComponentFboFormat);
  var pressureFBO1 = new FBO(gl, width, height, gl.FLOAT, singleComponentFboFormat);
  var advectVelocityKernel = new ComputeKernel(gl, {
      shader: shaders.get('kernel', 'advect'),
      mesh: inside,
      uniforms: {
        px: px,
        px1: px1,
        scale: 1.0,
        velocity: velocityFBO0,
        source: velocityFBO0,
        dt: options.step
      },
      output: velocityFBO1
    }),
    velocityBoundaryKernel = new ComputeKernel(gl, {
      shader: shaders.get('boundary', 'advect'),
      mesh: boundary,
      uniforms: {
        px: px,
        scale: -1.0,
        velocity: velocityFBO0,
        source: velocityFBO0,
        dt: 1/60
      },
      output: velocityFBO1
    }),
    cursor = new Mesh(gl, {
      vertex: geometry.screen_quad(px_x*options.cursor_size*2, px_y*options.cursor_size*2),
      attributes: {
        position: {}
      }
    }),
    addForceKernel = new ComputeKernel(gl, {
      shader: shaders.get('cursor', 'addForce'),
      mesh: cursor,
      blend: 'add',
      uniforms: {
        px: px,
        force: vec2.create([0.5, 0.2]),
        center: vec2.create([0.1, 0.4]),
        scale: vec2.create([options.cursor_size*px_x, options.cursor_size*px_y])
      },
      output: velocityFBO1
    }),
    divergenceKernel = new ComputeKernel(gl, {
      shader: shaders.get('kernel', 'divergence'),
      mesh: all,
      uniforms: {
        velocity: velocityFBO1,
        px: px
      },
      output: divergenceFBO
    }),
    jacobiKernel = new ComputeKernel(gl, {
      shader: shaders.get('kernel', 'jacobi'),
      // use all so the simulation still works
      // even if the pressure boundary is not
      // properly enforced
      mesh: all,
      nounbind: true,
      uniforms: {
        pressure: pressureFBO0,
        divergence: divergenceFBO,
        alpha: -1.0,
        beta: 0.25,
        px: px
      },
      output: pressureFBO1
    }),
    pressureBoundaryKernel = new ComputeKernel(gl, {
      shader: shaders.get('boundary', 'jacobi'),
      mesh: boundary,
      nounbind: true,
      nobind: true,
      uniforms: {
        pressure: pressureFBO0,
        divergence: divergenceFBO,
        alpha: -1.0,
        beta: 0.25,
        px: px
      },
      output: pressureFBO1
    }),

    subtractPressureGradientKernel = new ComputeKernel(gl, {
      shader: shaders.get('kernel', 'subtractPressureGradient'),
      mesh: all,
      uniforms: {
        scale: 1.0,
        pressure: pressureFBO0,
        velocity: velocityFBO1,
        px: px
      },
      output: velocityFBO0
    }),
    subtractPressureGradientBoundaryKernel = new ComputeKernel(gl, {
      shader: shaders.get('boundary', 'subtractPressureGradient'),
      mesh: boundary,
      uniforms: {
        scale: -1.0,
        pressure: pressureFBO0,
        velocity: velocityFBO1,
        px: px
      },
      output: velocityFBO0
    }),

    drawKernel = new ComputeKernel(gl, {
      shader: shaders.get('kernel', 'visualize'),
      mesh: all,
      uniforms: {
        velocity: velocityFBO0,
        pressure: pressureFBO0,
        px: px,
        color: false
      },
      output: null
    });

  // var rect = canvas.getBoundingClientRect();
  var x0 = bloodWidth;
  var y0 = bloodHeight;

  clock.ontick = function(dt){

    if (!renderBlood) {
      return;
    }
    tickCounter++;

    if (tickCounter % 500 == 0) {
      tickCounter = 0;
    }

    if (!playing ) {
      bloodPower = 50;
      // bloodWidth = (rect.width / 2) + (Math.random()*1000 - 500);
      // bloodHeight = (rect.height / 2) + (Math.random()*600 - 300);
      bloodWidth = mouseX;
      bloodHeight = mouseY;
      let x1 = bloodWidth * options.resolution;
      let y1 = bloodHeight * options.resolution;
      let xd = x1-x0;
      let yd = y1-y0;

      x0 = x1;
      y0 = y1;
      if(x0 === 0 && y0 === 0) xd = yd = 0;

      vec2.set([xd*px_x*60*(Math.random()*10 - 5),
           -yd*px_y*70*(Math.random()*10 - 5)], addForceKernel.uniforms.force);
      vec2.set([x0*px_x*2-1.0, (y0*px_y*2-1.0)*-1], addForceKernel.uniforms.center);

     } else {
      let x1 = bloodWidth * options.resolution;
      let y1 = bloodHeight * options.resolution;
      let xd = x1-x0;
      let yd = y1-y0;

      x0 = x1;
      y0 = y1;
      if(x0 === 0 && y0 === 0) xd = yd = 0;

      vec2.set([xd*px_x*bloodCursor*bloodPower,
           -yd*px_y*bloodCursor*bloodPower], addForceKernel.uniforms.force);
      vec2.set([x0*px_x*2-1.0, (y0*px_y*2-1.0)*-1], addForceKernel.uniforms.center);
    }

    advectVelocityKernel.uniforms.dt = options.step*1.0;
    advectVelocityKernel.run();
    addForceKernel.run();

    velocityBoundaryKernel.run();

    divergenceKernel.run();

    var p0 = pressureFBO0,
      p1 = pressureFBO1,
      p_ = p0;

    for(var i = 0; i < options.iterations; i++) {
      jacobiKernel.uniforms.pressure = pressureBoundaryKernel.uniforms.pressure = p0;
      jacobiKernel.outputFBO = pressureBoundaryKernel.outputFBO = p1;
      jacobiKernel.run();
      pressureBoundaryKernel.run();
      p_ = p0;
      p0 = p1;
      p1 = p_;
    }

    subtractPressureGradientKernel.run();
    subtractPressureGradientBoundaryKernel.run();

    drawKernel.run();
  };
}

loader.load([
    'js/shaders/advect.frag',
    'js/shaders/addForce.frag',
    'js/shaders/divergence.frag',
    'js/shaders/jacobi.frag',
    'js/shaders/subtractPressureGradient.frag',
    'js/shaders/visualize.frag',
    'js/shaders/cursor.vertex',
    'js/shaders/boundary.vertex',
    'js/shaders/kernel.vertex'
], () => {
  // just load it when it's there. If it's not there it's hopefully not needed.
  gl.getExtension('OES_texture_float_linear');
  var format = hasFloatLuminanceFBOSupport() ? gl.LUMINANCE : gl.RGBA;
  var onresize;

  window.addEventListener('resize', debounce(onresize = function(){
    var rect = canvas.getBoundingClientRect(),
      width = rect.width * options.resolution,
      height = rect.height * options.resolution;
    //console.log(rect.width, rect.height);
    //if(rect.width != canvas.width || rect.height != canvas.height){
      input.updateOffset();
      window.clearInterval(intervalID);
      setup(width, height, format);
    //}
  }, 250));

  onresize();
  clock.start();
});


function onMouseUpdate(e) {
  mouseX = e.pageX;
  mouseY = e.pageY;
  // console.log(mouseX, mouseY);
}

document.addEventListener('mousemove', onMouseUpdate, false);
document.addEventListener('mouseenter', onMouseUpdate, false);


function fail(el, msg, id) {
  document.getElementById('video').style.display = 'block';
}



var resetBlood = function () {
  bloodHeight = 50;
  bloodWidth = 50;
  bloodPower = 10;
  bloodCursor = 120;
}

var Visualizer = function() {
  this.audioContext = null;
  this.source = null; //the audio source
  this.infoUpdateId = null; //to store the setTimeout ID and clear the interval
  this.animationId = null;
  this.status = 0; //flag for sound is playing 1 or stopped 0
  this.forceStop = false;
  this.allCapsReachBottom = false;
};


Visualizer.prototype = {
  ini: function() {
    this._prepareAPI();
    this._addEventListner();
  },
  _prepareAPI: function() {
    //fix browser vender for AudioContext and requestAnimationFrame
    window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;
    window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
    window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || window.msCancelAnimationFrame;
    try {
      this.audioContext = new AudioContext();
    } catch (e) {
      console.log(e);
    }
  },
  _addEventListner: function() {
    var that = this;

    var listenButton = document.getElementById('listen-button');
    listenButton.addEventListener("click", function() {
      var loaded = false;

      if (playing){
        window.audioBufferSouceNode.stop();
        offset = Date.now() - startTime;
        paused = true;
        playing = true;
      }
      else if (!playing && offset == 0) {
        listenButton.innerHTML = 'Pause';
        offset = 0;
        startTime = Date.now();
        that._visualize(that.audioContext, window.audioBufferSouceNode.buffer, offset, listenButton);
        paused = false;
        playing = true;
      }
      else {
        startTime = Date.now() - offset;
        that._visualize(that.audioContext, window.audioBufferSouceNode.buffer, (offset / 1000) % window.audioBufferSouceNode.buffer.duration, listenButton);
        paused = false;
        playing = true;
      }

    }, false);
  },

  _visualize: function(audioContext, buffer, offset, track) {
    window.audioBufferSouceNode = audioContext.createBufferSource();
    var analyser = audioContext.createAnalyser();
    var that = this;
    //connect the source to the analyser
    window.audioBufferSouceNode.connect(analyser);
    //connect the analyser to the destination(the speaker), or we won't hear the sound
    analyser.connect(audioContext.destination);
    //then assign the buffer to the buffer source node
    if (buffer == null) {
      window.audioBufferSouceNode.stop();
      return;
    }

    window.audioBufferSouceNode.buffer = buffer;
    //play the source
    if (!window.audioBufferSouceNode.start) {
      window.audioBufferSouceNode.start = window.audioBufferSouceNode.noteOn //in old browsers use noteOn method
      window.audioBufferSouceNode.stop = window.audioBufferSouceNode.noteOff //in old browsers use noteOn method
    };
    //stop the previous sound if any
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.source !== null) {
      this.source.stop(0);
    }
    window.audioBufferSouceNode.start(0, offset);
    this.status = 1;
    this.source = window.audioBufferSouceNode;
    window.audioBufferSouceNode.onended = function() {
      offset = 0;

      startTime = 0;
      playing = false;

      track.innerHTML = 'Listen';
    };

    this._drawSpectrum(analyser);
  },
  _drawSpectrum: function(analyser) {
    var that = this,
      canvas = document.getElementById('c'),
      capYPositionArray = []; ////store the vertical position of hte caps for the preivous frame
    //ctx = canvas.getContext('2d'),
    if (!renderBlood) {
      return;
    }
    var drawMeter = function() {

      analyser.fftSize = 2048;
      analyser.minDecibels = -80;
      analyser.maxDecibels = -10;
      var array = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(array);
      if (that.status === 0) {
        //fix when some sounds end the value still not back to zero
        for (let i = array.length - 1; i >= 0; i--) {
          array[i] = 0;
        };
        this.allCapsReachBottom = true;
        for (let i = capYPositionArray.length - 1; i >= 0; i--) {
          this.allCapsReachBottom = this.allCapsReachBottom && (capYPositionArray[i] === 0);
        };
        if (this.allCapsReachBottom) {
          cancelAnimationFrame(that.animationId); //since the sound is top and animation finished, stop the requestAnimation to prevent potential memory leak,THIS IS VERY IMPORTANT!
          return;
        };
      };


      var bassValue = (array[0] + array[1] + array[2] + array[3]) / 4;
      var kickValue = (array[3] + array[4] + array[5] + array[6] + array[7] ) / 5;
      var midSum = 0;
      var highSum = 0;
      for (let i = 25; i < 325; i++) {
          midSum += array[i];
      };

       for (let i = 500; i < 1000; i++) {
          highSum += array[i];
      };
      var highValue = (highSum / 500) * 5;
      var midValue = (midSum / 300) * 1.5;

      //Transform sub value
      bassValue = Math.max(0, 10 * (Math.exp(bassValue * 0.02) - 2));
      kickValue = Math.max(0, 10 * (Math.exp((kickValue + 10) * 0.02) - 2));


      var rect = canvas.getBoundingClientRect();
      if (playing && !paused) {
        bloodWidth = (rect.width / 2) - 300 + kickValue + bassValue;
        bloodHeight = (rect.height / 2) - 125 + 1.3 * midValue - highValue;
        bloodPower = Math.max((bassValue / 11), 3);
        bloodCursor = bloodPower * 1.8 + 20;
        options.mouse_force = bloodPower;
      }
      that.animationId = requestAnimationFrame(drawMeter);
    }
    this.animationId = requestAnimationFrame(drawMeter);
  },
  _audioEnd: function(instance) {
    resetBlood();
    if (this.forceStop) {
      this.forceStop = false;
      this.status = 1;
      return;
    };
    this.status = 0;
  }

}


class Scope extends React.Component {
  constructor(props) {
    super(props);
    this.player = React.createRef();
    this.video0 = React.createRef();
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();


    console.log('onload!!!');

    new Visualizer().ini();

  }

  componentDidUpdate(prevProps) {
    HEIGHT = window.innerHeight;
    WIDTH = window.innerWidth;
    if (!prevProps.playing && this.props.playing) {
      this.audioCtx.resume().then(() => {
        this.player.current.play();
      });
    }

    // if (!prevProps.videoPlaying && this.props.videoPlaying) {
    //   this.video0.current.play();
    // }
  }

  componentDidMount() {
    HEIGHT = window.innerHeight;
    WIDTH = window.innerWidth;
    const audioElement = this.player.current;
    let audioCtx = this.audioCtx;
    const videoFilter = config.video.filter;

    var analyser = audioCtx.createAnalyser();

    const canvas = document.getElementById('canvas');
    const canvasCtx = canvas.getContext('2d');
    const videoCtx0 = document.getElementById('video0');

    let source = audioCtx.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    analyser.fftSize = 2048;
    analyser.minDecibels = -80;

    var bufferLength = analyser.frequencyBinCount;
    var dataArray = new Uint8Array(bufferLength);
    const bassArray = new Uint8Array(bufferLength);

    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    const bgElem = document.getElementById('bg');
    const overlayElem = document.getElementById('text-overlay');
    const coverElem = document.getElementById('cover-container');

    const draw = () => {
      HEIGHT = window.innerHeight;
      WIDTH = window.innerWidth;

      canvasCtx.canvas.width = WIDTH;
      canvasCtx.canvas.height = HEIGHT;
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);
      analyser.getByteFrequencyData(bassArray);

      let bassValue = (bassArray[0] + bassArray[1] + bassArray[2] + bassArray[3] + bassArray[4]) / 5;
      bassValue = Math.max(0, 10 * (Math.exp(bassValue * 0.02) - 2));
      const bassNormalized = Math.min(bassValue / 1500, 1) / 2;

      // let highValue = sum(bassArray.slice(768)) / 256;
      let highValue = sum(bassArray.slice(768));
      highValue = Math.max(0, 10 * (Math.exp(highValue * 0.02) - 2));
      let midValue = sum(bassArray.slice(128)) / 896;
      // let midValue = sum(bassArray.slice(128));
      // midValue = Math.max(0, 10 * (Math.exp(midValue * 0.02) - 2));

      window.bassNormalized = bassNormalized;

      // bgElem.style.filter = `blur(${bassValue * 0.004}px)`;
      // overlayElem.style.filter = `blur(${bassValue * 0.002}px)`;
      // overlayElem.style.transform = `translateY(${midValue * .15}px)`;

      let greyscale = Math.max(50 - midValue * 4, 0);
      let blurValue = bassValue * bassValue * 0.00001 * 0.25;
      // blurValue = Math.min(bassValue, 5);
      blurValue = bassValue / 256;
      let filterString = `${videoFilter} blur(${blurValue}px)`;

      // videoCtx0.style.transform = `scale(${1 + bassValue * 0.0002})`;
      // videoCtx0.style.filter = filterString;
      // console.log('greyscale', greyscale, midValue, highValue);
      // videoCtx.style.filter = `grayscale(${Math.max(70 - bassValue * 0.15, 0)}%)`;
      // slideCtx.filter = `blur(200px)`;

      canvasCtx.fillStyle = 'rgba(200, 200, 200, 0)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
      canvasCtx.lineWidth = Math.max(bassValue / 100, 2);
    };

    draw();
  }

  render() {
    return (
      <div className="viz">
        <canvas id="canvas"></canvas>
        <audio
          ref={this.player}
          src={this.props.audioSrc}
          type="audio/mpeg"
          preload="auto"
          id="audioPlayer"
        />
        <div id="cover-container"></div>
      </div>
    );
  }
}

Scope.propTypes = {
  rotationOffset: PropTypes.number, // hue offset between different scopes (in degrees)
  colors: PropTypes.arrayOf(PropTypes.string), // static color for each scope
  audioSrc: PropTypes.string.isRequired,
};

Scope.defaultProps = {
  rotationOffset: 0,
  colors: ['#FFFFFF', '#FFFFFF'],
}

export default Scope;
