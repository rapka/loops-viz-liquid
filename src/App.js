import React, { useState, useCallback, useEffect } from 'react';
import set from 'lodash/set';

import Scope from './Scope';
import TextOverlay from './TextOverlay';
import Background from './Background';

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

  const { artist, title, art, scopes, album } = config;

  console.log('amama', config);

  return (
    <div className="App">
      <div id="blurOverlay" />
      <Scope
        playing={playing}
        videoPlaying={videoPlaying}
        audioSrc={config.track}
        videoSrc={config.videoSrc}
        {...scopes}
      />
      <Background playing={playing} />
      <TextOverlay
        artist={artist}
        title={title}
        album={album}
      />
    </div>
  );
}

export default App;

// export default function App2() { return null };
