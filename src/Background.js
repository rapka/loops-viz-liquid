import React, { useState } from 'react';
import classNames from 'classnames';
import set from 'lodash/set';
import times from 'lodash/times';
import FilmGrain from './FilmGrain';

import config from './config';

import './Background.css';

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

function Background(props) {
  const { background, bpm } = config;
  const { vertical, color, image, directory, css, numImages } = background;

  const bgStyles = {};
  const bgContainerStyles = {};

  let bgImageElems = [];
  let noiseImageElems = [];
  let aImages = [];
  let noiseImages = [];

  let interval = 16.666;
  if (bpm) {
    interval = Math.round(1000 / ((bpm * 4) / 60));
  }


  if (css) {
    bgStyles.background = css;
  } else {
    set(bgStyles, 'backgroundColor', color, undefined);
    set(bgStyles, 'backgroundImage', `url('/${directory}/${currentImage}.png')`, '');
  }

  const bgClasses = classNames({
    bg: true,
    'bg-vertical': vertical,
  })

  return (
    <div className="bg-container" id="bg" style={bgContainerStyles}>
      <FilmGrain />
    </div>
  );
}

export default Background;
