// if (typeof define !== 'function') { var define = require('amdefine')(module);}

// define(function(require, exports, module){
var camera = require('./camera');

exports.Root = function() {
    this.camera = camera;
    this.uniforms = Object.create(null);
}; 
exports.Root.prototype = {
};

// });
