var camera = require('./camera');

exports.Root = function() {
    this.camera = camera;
    this.uniforms = Object.create(null);
}; 
exports.Root.prototype = {
};
