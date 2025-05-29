import React from 'react';
import PropTypes from 'prop-types';
import sum from 'lodash/sum';
import get from 'lodash/get';
import TextOverlay from './TextOverlay';

import config from './config';

import './Visualizer.css';


const Loader = require('./js/src/engine/loader');
const Clock = require('./js/src/engine/clock').Clock;
const InputHandler = require('./js/src/engine/input').Handler;
const debounce = require('./js/src/engine/utils').debounce;
const ShaderManager = require('./js/src/engine/gl/shader').Manager;
const geometry = require('./js/src/engine/gl/geometry');
const FBO = require('./js/src/engine/gl/texture').FBO;
const Mesh = require('./js/src/engine/gl/mesh').Mesh;
const glcontext = require('./js/src/engine/gl/context');
const vec2 = require('./js/src/gl-matrix').vec2;
const ComputeKernel = require('./js/src/compute').Kernel;

const CONFIG_WIDTH = get(config, 'canvas.width', 1920);
const CONFIG_HEIGHT = get(config, 'canvas.height', 1080);
const FIT_TO_WINDOW = get(config, 'canvas.fitToWindow', 1080);

require('./js/src/game-shim');

let renderBlood = true;

window.audioBufferSouceNode = null;
let tickCounter = 0;

let bloodHeight = 20;
let bloodPower = 20;
let bloodWidth = 20;
let options = {
  iterations: get(config, 'canvas.iterations', 18),
  mouse_force: 10,
  resolution: get(config, 'canvas.resolution', 0.5),
  cursor_size: 80,
  step: 1/60,
};

let mouseX = null;
let mouseY = null;

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
}


class Visualizer extends React.Component {
  constructor(props) {
    super(props);
    this.player = React.createRef();
    this.video0 = React.createRef();
    this.canvas = React.createRef();
    this.canvasCtx = null;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    this.currentWidth = CONFIG_WIDTH;
    this.currentHeight = CONFIG_HEIGHT;
    this.state = {
      resolution: {
        width: CONFIG_WIDTH,
        height: CONFIG_HEIGHT,
      },
    };

    this.shaders = null;
    this.clock = null;
  }

  setup(fullWidth, fullHeight, singleComponentFboFormat) {
    let canvas = this.canvas.current;
    const width = fullWidth * options.resolution;
    const height = fullHeight * options.resolution;
    this.setState({ resolution: { width: fullWidth, height: fullHeight } })

    var gl = window.gl;

    canvas.width = width;
    canvas.height = height;

    gl.viewport(0, 0, canvas.width, canvas.height);
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
        // use all so the simulation still works even if the
        // pressure boundary is not properly enforced
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

        vec2.set([xd*px_x*bloodPower,
             -yd*px_y*bloodPower], addForceKernel.uniforms.force);
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
    this.canvasCtx = gl;

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
          input.updateOffset();

          let width = CONFIG_WIDTH;
          let height = CONFIG_HEIGHT;

          if (FIT_TO_WINDOW) {
            width = window.innerWidth;
            height = window.innerHeight;
          }

          console.log('newww', width, this.state.resolution.width, height, this.state.resolution.height);

          this.setup(width, height, format);
      };

      if (FIT_TO_WINDOW) {
        window.addEventListener('resize', debounce(onresize, 250));
      }

      onresize();
      this.clock.start();
    });

    const audioElement = this.player.current;
    let audioCtx = this.audioCtx;

    var analyser = audioCtx.createAnalyser();
    const videoCtx0 = document.getElementById('video0');

    let source = audioCtx.createMediaElementSource(audioElement);

    window.audioBufferSouceNode = audioCtx.createBufferSource();

    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    analyser.fftSize = 2048;
    analyser.minDecibels = -80;

    var bufferLength = analyser.frequencyBinCount;
    var dataArray = new Uint8Array(bufferLength);
    const bassArray = new Uint8Array(bufferLength);

    const bgElem = document.getElementById('bg');
    // const overlayElem = document.getElementById('text-overlay');
    const coverElem = document.getElementById('logo-container');

    const playing = this.props.playing;
    const player = this.player.current;
    const draw = () => {
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
      let blurValue = bassValue * bassValue * 0.00001;
      // blurValue = Math.min(bassValue, 5);
      blurValue = bassValue * 3 / 256;

      if(coverElem && coverElem.style) {
       // coverElem.style.filter = `blur(${blurValue}px)`;
       // coverElem.style.transform = `translateY(${midValue * .25}px) scale(${1.0 + blurValue * 0.02})`;
      }

      // var rect = this.canvas.current.getBoundingClientRect();

      const MAX_OFFSET = 300;
      if (!player.paused) {
        // console.log('innn', bloodWidth, rect.width, rect.height);
        // bloodWidth = (rect.width / 2) - 300 + kickValue + bassValue;
        bloodWidth = (this.state.resolution.width * options.resolution) - MAX_OFFSET + kickValue + bassValue;
        bloodWidth = Math.max(bloodWidth, (this.state.resolution.width * options.resolution) - MAX_OFFSET);
        bloodWidth = Math.min(bloodWidth, (this.state.resolution.width * options.resolution) + MAX_OFFSET);

        bloodHeight = (this.state.resolution.height * options.resolution) - MAX_OFFSET + 25 + (1.3 * (midValue + highValue));
        bloodHeight = Math.max(bloodHeight, (this.state.resolution.height * options.resolution) - MAX_OFFSET);
        bloodHeight = Math.min(bloodHeight, (this.state.resolution.height * options.resolution) + MAX_OFFSET);
        bloodPower = Math.max((bassValue / 20), 3);
        options.mouse_force = bloodPower;

        console.log('bbb', bloodWidth);

      }

      // console.log('greyscale', greyscale, midValue, highValue);
      // slideCtx.filter = `blur(200px)`;
    };

    draw();
  }

  render() {
    const style = {
      width: `${config.canvas.width}px`,
      height: `${config.canvas.height}px`,
    };

    if (config.canvas.fitToWindow) {
      style.width = '100%';
      style.height = '100%';
    }

    const splitTitle = this.props.title.split('');
    const innerAngle = 360 / splitTitle.length;


    return (
      <div className="viz" style={style}>
          <canvas
            ref={this.canvas}
            id="canvas"
            width={this.state.resolution.width}
            height={this.state.resolution.height}
            style={{
              width: `${this.state.resolution.width}px`,
              height: `${this.state.resolution.height}px`,
            }} />
        <audio
          ref={this.player}
          src={this.props.audioSrc}
          type="audio/mpeg"
          preload="auto"
          id="audioPlayer"
        />
        <TextOverlay
          title={this.props.title}
          playing={this.props.playing}
        />
        <div id="logo-container" className="logo-container"><img className="logo-image" src="img/logo-wb.png" /></div>
      </div>
    );
  }
}

Visualizer.propTypes = {
  audioSrc: PropTypes.string.isRequired,
  playing: PropTypes.bool,
  title: PropTypes.string,
};

Visualizer.defaultProps = {
  playing: false,
  title: '',
};

export default Visualizer;
