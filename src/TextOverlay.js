import React from 'react';
import PropTypes from 'prop-types';
import config from './config';

import './TextOverlay.css';

const TextOverlay = (props) => {
  const artistColor = config.artistTextColor || '#FFFFFF';
  const artistShadowColor = config.artistTextShadowColor || '#000000';
  const titleColor = config.titleTextColor || '#FFFFFF';
  const titleShadowColor = config.titleTextShadowColor || '#000000';

  const styles = {
    color: artistColor,
  };

  return (
    <div className="text-container" id="text-overlay" >
      <div className="artist artist1" id="artist" style={styles}>
        {props.artist}
      </div>
      <div className="title title1" id="title" style={styles}>
        {props.title}
      </div>
      <div className="album album1" id="album" style={styles}>
        {props.album}
      </div>
    </div>
  );
}

TextOverlay.propTypes = {
  artist: PropTypes.string,
  title: PropTypes.string,
  album: PropTypes.string,
};

TextOverlay.defaultProps = {
  artist: '',
  title: '',
  album: '',
}

export default TextOverlay;
