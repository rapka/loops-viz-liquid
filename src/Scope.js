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


let WIDTH = 1920;
let HEIGHT = 1080;

console.log('requiring');
require('./js/src/game-shim');
console.log('requiring done');

var renderBlood = true;

var intervalID;
window.audioBufferSouceNode = null;
var tickCounter = 0;

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


function onMouseUpdate(e) {
  mouseX = e.pageX;
  mouseY = e.pageY;
}

document.addEventListener('mousemove', onMouseUpdate, false);
document.addEventListener('mouseenter', onMouseUpdate, false);

var resetBlood = function () {
  bloodHeight = 50;
  bloodWidth = 50;
  bloodPower = 10;
  bloodCursor = 120;
}


class Scope extends React.Component {
  constructor(props) {
    super(props);
    this.player = React.createRef();
    this.video0 = React.createRef();
    this.canvas = React.createRef();
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    this.shaders = null;
    this.clock = null;
  }

  setup(width, height, singleComponentFboFormat) {
    var canvas = this.canvas.current;

    console.log('ins setup', canvas, this.canvas);
    var gl = window.gl;

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
        shader: this.shaders.get('kernel', 'advect'),
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
        shader: this.shaders.get('boundary', 'advect'),
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
        shader: this.shaders.get('cursor', 'addForce'),
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
        shader: this.shaders.get('kernel', 'divergence'),
        mesh: all,
        uniforms: {
          velocity: velocityFBO1,
          px: px
        },
        output: divergenceFBO
      }),
      jacobiKernel = new ComputeKernel(gl, {
        shader: this.shaders.get('kernel', 'jacobi'),
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
        shader: this.shaders.get('boundary', 'jacobi'),
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
        shader: this.shaders.get('kernel', 'subtractPressureGradient'),
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
        shader: this.shaders.get('boundary', 'subtractPressureGradient'),
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
        shader: this.shaders.get('kernel', 'visualize'),
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

    const playing = this.props.playing;
    const paused = this.player.current.paused;
    const player = this.player.current;

    this.clock.ontick = function(dt){

      if (!renderBlood) {
        return;
      }
      tickCounter++;

      if (tickCounter % 500 == 0) {
        tickCounter = 0;
      }

      if (!playing) {
        bloodPower = 50;
        // bloodWidth = (rect.width / 2) + (Math.random()*1000 - 500);
        // bloodHeight = (rect.height / 2) + (Math.random()*600 - 300);
        if (player.paused) {
          bloodWidth = mouseX;
          bloodHeight = mouseY;
        }

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

  hasFloatLuminanceFBOSupport(){
    var fbo = new FBO(window.gl, 32, 32, window.gl.FLOAT, window.gl.LUMINANCE);
    return fbo.supported;
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.playing && this.props.playing) {
      this.audioCtx.resume().then(() => {
        this.player.current.play();
      });
    }
  }

  componentDidMount() {
    const canvas = this.canvas.current;
    var gl = glcontext.initialize(canvas, {
      context: {
        depth: false
      },
      debug: false,
      //log_all: true,
      extensions: {
        texture_float: true
      }
    });
    window.gl = gl;

    this.clock = new Clock(canvas);
    var input = new InputHandler(canvas);
    var loader = new Loader();
    var resources = loader.resources;
    this.shaders = new ShaderManager(gl, resources);

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
    var format = this.hasFloatLuminanceFBOSupport() ? gl.LUMINANCE : gl.RGBA;

    var onresize = () => {
        // var rect = canvas.getBoundingClientRect(),
        //   width = rect.width * options.resolution,
        //   height = rect.height * options.resolution;
        // console.log('mmmm', rect.width, rect.height);
        // if(rect.width != canvas.width || rect.height != canvas.height){
          input.updateOffset();
          window.clearInterval(intervalID);
          // this.setup(width, height, format);
          this.setup(WIDTH, HEIGHT, format);
        //}
      };

      window.addEventListener('resize', debounce(onresize, 250));
      onresize();

      this.clock.start();
    });

    const audioElement = this.player.current;
    let audioCtx = this.audioCtx;
    const videoFilter = config.video.filter;

    var analyser = audioCtx.createAnalyser();

    console.log('aaa', this.canvas.current, this.canvas.current.getContext('2d'), this.player.current);

    const videoCtx0 = document.getElementById('video0');

    let source = audioCtx.createMediaElementSource(audioElement);

   window.audioBufferSouceNode = audioCtx.createBufferSource();

    console.log('bbb', source, window.audioBufferSouceNode);


    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    analyser.fftSize = 2048;
    analyser.minDecibels = -80;

    var bufferLength = analyser.frequencyBinCount;
    var dataArray = new Uint8Array(bufferLength);
    const bassArray = new Uint8Array(bufferLength);

    // canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    const bgElem = document.getElementById('bg');
    const overlayElem = document.getElementById('text-overlay');
    const coverElem = document.getElementById('cover-container');

    const playing = this.props.playing;
    const player = this.player.current;
    const draw = () => {
      // console.log('dm', playing, player.paused, kickValue);

      canvasCtx.canvas.width = WIDTH;
      canvasCtx.canvas.height = HEIGHT;
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);
      analyser.getByteFrequencyData(bassArray);

      var bassValue = (bassArray[0] + bassArray[1] + bassArray[2] + bassArray[3]) / 4;
      var kickValue = (bassArray[3] + bassArray[4] + bassArray[5] + bassArray[6] + bassArray[7] ) / 5;

      // let bassValue = (bassArray[0] + bassArray[1] + bassArray[2] + bassArray[3] + bassArray[4]) / 5;
      // bassValue = Math.max(0, 10 * (Math.exp(bassValue * 0.02) - 2));
      // const bassNormalized = Math.min(bassValue / 1500, 1) / 2;

      // let highValue = sum(bassArray.slice(768)) / 256;
      let highValue = sum(bassArray.slice(768));
      highValue = Math.max(0, 10 * (Math.exp(highValue * 0.02) - 2));
      let midValue = sum(bassArray.slice(128)) / 896;
      // let midValue = sum(bassArray.slice(128));
      // midValue = Math.max(0, 10 * (Math.exp(midValue * 0.02) - 2));

      // window.bassNormalized = bassNormalized;

      // console.log('draw2', bassNormalized);

      // bgElem.style.filter = `blur(${bassValue * 0.004}px)`;
      // overlayElem.style.filter = `blur(${bassValue * 0.002}px)`;
      // overlayElem.style.transform = `translateY(${midValue * .15}px)`;

      let greyscale = Math.max(50 - midValue * 4, 0);
      let blurValue = bassValue * bassValue * 0.00001 * 0.25;
      // blurValue = Math.min(bassValue, 5);
      blurValue = bassValue / 256;
      let filterString = `${videoFilter} blur(${blurValue}px)`;

      // var rect = this.canvas.current.getBoundingClientRect();
      if (!player.paused) {
        // console.log('innn', bloodWidth, rect.width, rect.height);
        // bloodWidth = (rect.width / 2) - 300 + kickValue + bassValue;
        bloodWidth = (WIDTH) - 300 + kickValue + bassValue;
        bloodHeight = (HEIGHT) - 125 + 1.3 * midValue - highValue;
        bloodPower = Math.max((bassValue / 11), 3);
        bloodCursor = bloodPower * 1.8 + 20;
        options.mouse_force = bloodPower;
      }

      // console.log('greyscale', greyscale, midValue, highValue);
      // slideCtx.filter = `blur(200px)`;
    };

    draw();
  }

  render() {
    return (
      <div className="viz">
        <div id="cc"><canvas ref={this.canvas} id="canvas" width={WIDTH} height={HEIGHT} /></div>
        <audio
          ref={this.player}
          src={this.props.audioSrc}
          type="audio/mpeg"
          preload="auto"
          id="audioPlayer"
        />
        <div id="cover-container" className="label-logo"><img className="logo-image" src="img/logo.png" /></div>
      </div>
    );
  }
}

Scope.propTypes = {
  rotationOffset: PropTypes.number, // hue offset between different scopes (in degrees)
  audioSrc: PropTypes.string.isRequired,
};

Scope.defaultProps = {
  rotationOffset: 0,
}

export default Scope;
