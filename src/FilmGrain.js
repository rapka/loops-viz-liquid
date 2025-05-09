import React, { useState } from 'react';
import classNames from 'classnames';
import set from 'lodash/set';
import times from 'lodash/times';

import config from './config';

import './FilmGrain.css';

let currentImage = 0;
let canvas, ctx, noiseCtx;

const NUM_NOISE_FRAMES = 6;


function noise(ctx) {

  const w = ctx.canvas.width,
        h = ctx.canvas.height,
        iData = ctx.createImageData(w, h),
        buffer32 = new Uint32Array(iData.data.buffer),
        len = buffer32.length
    let i = 0

  for(; i < len;i++)

    if (Math.random() < 0.5) buffer32[i] = 0xffffffff;

    ctx.putImageData(iData, 0, 0);
}

function FilmGrain(props) {
  const { background, bpm } = config;
  const { vertical, color, image, directory, css, numImages } = background;
  const { scale, opacity } = config.filmGrain;

  console.log('scale', scale);

  const bgStyles = {};
  const bgContainerStyles = {};

  let noiseImageElems = [];

  let interval = 16.666;
  if (bpm) {
    interval = Math.round(1000 / ((bpm * 4) / 60));
  }


  if (css) {
    bgStyles.background = css;
  }

  // setTimeout(() => {
  // // if (props.playing) {
  //   canvas = document.getElementById('slideshow');
  //   ctx = canvas.getContext('2d');
  //   noiseCtx =
  //   setInterval(() => {
  //     ctx.clearRect(0, 0, 1920, 1080);
  //     noise(ctx);
  //   }, interval);
  // // }
  // }, interval * 4);

  const bgClasses = classNames({
    bg: true,
    'bg-vertical': vertical,
  })

  return (
    <div className="filmGrain-container" id="bg" style={bgContainerStyles}>
      <canvas id="slideshow" width="1920" height="1080" style={{ transform: `scale(${scale})`, opacity }}></canvas>
    </div>
  );
}

export default FilmGrain;
