import React from 'react';
import PropTypes from 'prop-types';
import config from './config';

import './TextOverlay.css';

const TextOverlay = (props) => {
  const splitTitle = props.title.split('');
  const innerAngle = 360 / splitTitle.length;

  return (
    <div className="text-container" id="text-overlay" >
      <span
         className={`text-ring title${props.playing ? ' playing' : ''}`}
         id="title"
         style={{
           '--total': splitTitle.length,
           '--radius': 1 / Math.sin(innerAngle / (180 / Math.PI))
         }}
       >
         {splitTitle.map((char, index) => (
           <span style={{'--index': index }} key={index}>
             {char}
           </span>
         ))}
       </span>
    </div>
  );
}

TextOverlay.propTypes = {
  title: PropTypes.string,
  playing: PropTypes.bool,
};

TextOverlay.defaultProps = {
  title: '',
  playing: false,
}

export default TextOverlay;
