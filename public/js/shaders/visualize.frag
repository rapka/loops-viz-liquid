precision highp float;
uniform sampler2D velocity;
uniform sampler2D pressure;
varying vec2 uv;
uniform float visualizerMode;
uniform bool color;

void main(){
    vec4 transPink = vec4(0.96, 0.65, 0.71, 1.0);
    vec4 transBlue = vec4(0.35, 0.80, 0.98, 1.0);
    vec4 transWhite = vec4(1.0, 1.0, 1.0, 1.0);
    float vel_x = texture2D(velocity, uv).x;
    float vel_y = texture2D(velocity, uv).y;
    float pre_x = texture2D(pressure, uv).x;
    float pre_y = texture2D(pressure, uv).y;

    //if (x > 0.9) {
      //x = 0.05;
      //x / 10.0;
      //x = 1.4 + -1.2 * x;
    //}

    //if (color) {
    //  gl_FragColor = vec4(
    //    (texture2D(velocity, uv)).xy,
    //    (texture2D(pressure, uv)).x,
    //
    //  1.0);
    //} else {
    //  gl_FragColor = vec4(
    //    x,
    //    (texture2D(pressure, uv) * .8).xy,
    //  1.0);
    //}

    gl_FragColor = vec4(
        (texture2D(pressure, uv)).x,
        //0.0, 0.0,
        (texture2D(velocity, uv)).xy,
    1.0) * 1.8;



     // zero out high freq data
  //if (gl_FragColor[1] > 0.99 || gl_FragColor[2] > 0.99) {
  //	gl_FragColor[0] = 0.0;
  //	gl_FragColor[1] = 0.0;
  //	gl_FragColor[2] = 0.0;
  //}

   //gl_FragColor[1] = gl_FragColor[1] * 40.0;
   //gl_FragColor[2] = gl_FragColor[2] * 40.0;

    // Convert to red

    // if (!color) {
    //   gl_FragColor[0] = min(1.0, (gl_FragColor[0] + gl_FragColor[1] + gl_FragColor[2]) / 0.8);
    //   gl_FragColor[1] = 0.0;
    //   gl_FragColor[2] = 0.0;
    // }


    // Specular effect
    //if (gl_FragColor[0] > 0.98) {
    //	gl_FragColor[1] = (gl_FragColor[0] - 0.9);
    //	gl_FragColor[2] = (gl_FragColor[0] - 0.9);
    //}

    // if (gl_FragColor[0] > 0.7) {
    // 	gl_FragColor[0] = 0.7;
    // }

    // gl_FragColor[2] = gl_FragColor[2] + 0.02;

    //gl_FragColor[2] = gl_FragColor[3];

    //float avg = (gl_FragColor[0] + gl_FragColor[1] + gl_FragColor[2] ) / 3.0;
    //float avg = (texture2D(pressure, uv).x + texture2D(pressure, uv).y) / 2.0;
    float avgPressure = (pre_x + pre_y) / 2.0;
    float avgVelocity = (vel_x + vel_y) / 2.0;
    float avgX = (pre_x + vel_x) / 2.0;
    float avgY = (pre_y + vel_y) / 2.0;
    //float avg = avgVelocity * 0.25 + avgPressure * 0.75;
    float avg = avgVelocity * 1.5 + avgPressure * 1.5;

    float oldR = gl_FragColor[0];
    float oldG = gl_FragColor[1];
    float oldB = gl_FragColor[2];
    float t_1 = 0.0;
    float t_2 = 0.10;
    float t_3 = 0.20;
    float t_4 = 0.6;

    if (avg < t_1) {
      gl_FragColor = transPink;
    } else if (avg >= t_1 && avg < t_2) {
      float percent = (avg - t_1) / (t_2 - t_1);
      gl_FragColor = transWhite * percent + transPink * (1.0 - percent);
    } else if (avg >= t_2 && avg < t_3) {
      float percent = (avg - t_1) / (t_3 - t_2);
      gl_FragColor = transWhite;
    } else if (avg >= t_3 && avg < t_4) {
      float percent = (avg - t_3) / (t_4 - t_3);
      gl_FragColor = transBlue * percent + transWhite * (1.0 - percent);
    } else {
      gl_FragColor = transBlue;
    }

    //gl_FragColor = transPink * (0.0 - oldR) + transPink * (0.0 - oldG) + transBlue * (0.0 - oldB);

}
