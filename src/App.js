import React, { useState, useCallback, useEffect } from 'react';
import set from 'lodash/set';

import Visualizer from './Visualizer';
import TextOverlay from './TextOverlay';

import config from './config';

import './App.css';

function App() {
  const [playing, setPlaying] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const playFunction = useCallback((event) => {
    console.log('aaaa', event.keyCode);
    if(event.keyCode === 32) {
      event.preventDefault();
      setPlaying(true);
      setVideoPlaying(true);
    }
    setTimeout(() => {
      // setVideoPlaying(true);
    }, 0);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", playFunction, false);

    return () => {
      document.removeEventListener("keydown", playFunction, false);
    };
  }, [playFunction]);

  const { artist, title, art, Visualizers, album } = config;

  console.log('amama', config);
  const style = {
    width: `${config.canvas.width}px`,
    height: `${config.canvas.height}px`,
  };

  if (config.canvas.fitToWindow) {
    style.width = '100%';
    style.height = '100%';
  }

  return (
    <div className="App" style={style}>
      <div id="blurOverlay" />
      <Visualizer
        playing={playing}
        videoPlaying={videoPlaying}
        audioSrc={config.track}
        {...Visualizers}
      />
      <TextOverlay
        artist={artist}
        title={title}
        album={album}
        playing={playing}
      />
    </div>
  );
}

export default App;
