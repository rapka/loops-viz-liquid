import React, { useState, useCallback, useEffect } from 'react';
import set from 'lodash/set';

import Visualizer from './Visualizer';

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

  return (
    <div className="App">
      <div id="blurOverlay" />
      <Visualizer
        playing={playing}
        videoPlaying={videoPlaying}
        audioSrc={config.track}
        title={title}
        {...Visualizers}
      />
    </div>
  );
}

export default App;
