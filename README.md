# byron-vis
This tool lets you show off or analyze your glider flights out of Byron airport. Just hit the link below and drag your *.igc file into the browser window. 
Everything is handled client side, if it doesn't work for you try a recent version of Google Chrome. I'm using ES6 which isn't supported well in all browsers, maybe send me a pull request for transpiling with babel?

[Visualizer Link](http://errantspark.github.io/byron-vis/)

[![License](https://img.shields.io/badge/license-mit-blue.svg)](https://opensource.org/licenses/MIT) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

## Features
- backend-less javascript, entire app runs on the client side
- quickly parses even lengthier files
- works pretty well on mobile

## Controls

| action | dektop | mobile |
|:--|:--| :--|
| select point  |  Click         |  Tap               |
| center point  |  Double Click  |  Double Tap        |
| orbit camera  |  Right Click   |  Two Finger Drag   |
| pan camera    |  Right Click   |  Three Finger Drag |
| zoom camera   |  Mouse Scroll  |  Pinch             |

## Libraries/Tech

- Written in [ES6](https://en.wikipedia.org/wiki/ECMAScript#6th_Edition)
- [THREE](https://github.com/mrdoob/three.js).js so I don't have to deal with WebGL
- [D3](https://github.com/mbostock/d3).js for 2d graphing
- [SunCalc](https://github.com/mourner/suncalc) for calculating solar position
- [Chroma](https://github.com/gka/chroma.js/) for color manipulation and scales
- JavaScript [Standard](https://github.com/feross/standard) style
