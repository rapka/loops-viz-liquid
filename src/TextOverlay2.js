import React from 'react';
import PropTypes from 'prop-types';
import config from './config';

import './TextOverlay2.css';

const TextOverlay = (props) => {
  const artistColor = config.artistTextColor || '#FFFFFF';
  const artistShadowColor = config.artistTextShadowColor || '#000000';
  const titleColor = config.titleTextColor || '#FFFFFF';
  const titleShadowColor = config.titleTextShadowColor || '#000000';



  const ART_SIZE = 858;
  const minsText = "34 MINUTES OF";

  const LETTER_WIDTH = 56;
  const titleSpacing = ((ART_SIZE + 6) - LETTER_WIDTH * props.title.length) / (props.title.length - 1);
  const minSpacing = ((ART_SIZE + 14) - LETTER_WIDTH * minsText.length) / (minsText.length - 1);

  const styles = {
    color: artistColor,
    letterSpacing: minSpacing,
  };

  return (
    <div className="text-container" id="text-overlay" >
      <div className="artist artist1 mins" id="artist" style={styles}>
        34 MINUTES OF
      </div>
        <br />
        <div className="fury">FURY</div>
        <div className="title" style={{letterSpacing: titleSpacing}}>{props.title}</div>
        <br />
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
