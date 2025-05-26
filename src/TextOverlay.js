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
         className="text-ring title"
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
};

TextOverlay.defaultProps = {
  title: '',
}

export default TextOverlay;


// const TextRing = (text) => {
//   const CHARS = text.split('')
//   const INNER_ANGLE = 360 / CHARS.length
//   return (
//     <span
//       className="text-ring"
//       style={{
//         '--total': CHARS.length,
//         '--radius': 1 / Math.sin(INNER_ANGLE / (180 / Math.PI))
//       }}
//     >
//       {CHARS.map((char, index) => (
//         <span style={{'--index': index }}>
//           {char}
//         </span>
//       ))}
//     </span>
//   )
// }
