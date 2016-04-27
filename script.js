/* global SunCalc THREE d3 chroma */
var container

var camera, scene, renderer
var state = {}
state.mouse = {}
state.index = 0

var igc,
  indicatorObject,
  controls,
  raycaster,
  windowHalfX,
  windowHalfY

// for debug purposes

var IGCparser = (function () {
  var parser = {}

  parser.parseIGC = function (igc) {
    var output = {}
    var lines = igc.split('\n')
    var dataStart = lines.findIndex(function (y) {
      return y[0] === 'B'
    })
    var dataEnd = lines.findIndex(function (y) {
      return y[0] === 'G'
    })

    var parseDatum = function (datum) {
      if (datum[0] === 'B') {
        var d = {}
        d.time = datum.slice(1, 7)
        d.lat = datum.slice(7, 15)
        d.lon = datum.slice(15, 24)
        d.pAlt = datum.slice(25, 30)
        d.gAlt = datum.slice(30, 35)
        return d
      } else {
        return 'GARBAGE!'
      }
    }

    var meta = lines.slice(0, dataStart)
    var path = lines.slice(dataStart, dataEnd)

    path = path.map(parseDatum)
    path = path.filter((e) => e !== 'GARBAGE!')

    output.meta = meta
    output.path = path

    return output
  }

  var latToDec = function (lat) {
    var deg = parseInt(lat.slice(0, 2))
    var min = parseInt(lat.slice(2, 4))
    var sec = parseInt(lat.slice(4, 7))
    return deg + (min / 60) + (sec / 60000)
  }

  var lonToDec = function (lon) {
    var deg = parseInt(lon.slice(0, 3))
    var min = parseInt(lon.slice(3, 5))
    var sec = parseInt(lon.slice(5, 8))
    return deg + (min / 60) + (sec / 60000)
  }

  var convertToRelativeCoord = function (indexLat, indexLon, Lat, Lon, sizeLat, sizeLon) {
    // takes a lat/long, an index point, and a width/height and returns relative poistion in x/y
    // for example convertToRelativeCoord(37,122,37.5,121.5,50,50) would return [25,25]

    var oLat = Lat - indexLat
    var oLon = indexLon - Lon
    // returns x/y indexed at bottom left like graph
    return [oLon * sizeLon, oLat * sizeLat]
  }

  parser.parseToJSON = function (data) {
    var output = {}
    var stats = {}

    var parse = parser.parseIGC(data)

    var convertedPath = parse.path.map(function (datum) {
      var dLat = latToDec(datum.lat)
      var dLon = lonToDec(datum.lon)
      var xy = convertToRelativeCoord(37.828, 121.625, dLat, dLon, -110, 88.5)
      xy.push(datum.pAlt)
      return xy
    })

    // convert altitude meters to kM, probably want to make this clearer
    convertedPath = convertedPath.map(xyz => [xyz[0], xyz[1], (xyz[2] / 1000)])

    var datestring = parse.meta.find(function (x) {
      return x.slice(0, 5) === 'HFDTE'
    })
    var timestring = parse.meta.find(function (x) {
      return x[0] === 'F'
    })

    var parseTimestring = function (timestring) {
      var hour = timestring.slice(1, 3)
      var min = timestring.slice(3, 5)
      var sec = timestring.slice(5, 7)
      return {
        hour: hour,
        min: min,
        sec: sec
      }
    }

    var day = datestring.slice(5, 7)
    var year = datestring.slice(9, 11)
    var month = datestring.slice(7, 9)

    var t = parseTimestring(timestring)

    var date = [month, day, year].join('/')
    var time = [t.hour, t.min, t.sec].join(':')

    var startDate = new Date(date + ' ' + time + ' UTC')

    var times = parse.path.map(function (datum) {
      var t = parseTimestring('F' + datum.time)
      var time = [t.hour, t.min, t.sec].join(':')
      var output = new Date(date + ' ' + time + ' UTC') - startDate
      if (output < 0) {
        output = output + 1000 * 60 * 60 * 24
      }
      return output
    })

    var altitudes = convertedPath.map(function (x) {
      return x[2]
    })

    stats.maxAlt = altitudes.reduce(function (a, b) {
      return Math.max(a, b)
    })
    stats.minAlt = altitudes.reduce(function (a, b) {
      return Math.min(a, b)
    })

    var paddedAlt = Array.prototype.concat.call(altitudes[0], altitudes, altitudes[altitudes.length - 1])
    var paddedTime = Array.prototype.concat.call(times[0], times, times[times.length - 1])
    // this needs to be calculated from timestamps isntead of per point
    var climbrate = altitudes.map(function (v, i) {
      var prev = v - paddedAlt[i]
      var next = paddedAlt[i + 2] - v
      var twoSegClimb = prev + next * 1000
      var ms = paddedTime[i + 2] - paddedTime[i]
      // climb rate in meters a second
      return twoSegClimb / (ms / 1000)
    })

    // refactor one of these two out probably?
    stats.date = startDate
    output.date = startDate

    output.meta = parse.meta
    output.time = times
    output.path = convertedPath
    output.climb = climbrate
    output.stats = stats

    return output
  }

  return parser
})()

var scaleToLegend = function (scale, domel) {
  var canvas = document.createElement('canvas')
  canvas.width = wh
  canvas.height = wh
  context.putImageData(imageData, 0, 0)

  var context = canvas.getContext('2d')
  document.getElementById('sidebar').appendChild(canvas)
}

var generateScaleMap = function (scale, wh) {
  // makes a texture from a gradient scale
  var data = new Uint8ClampedArray(4 * wh * wh)

  for (var i = 0; i < wh; i++) {
    for (var j = 0; j < wh; j++) {
      var color = scale(i / wh).rgb()

      var r = Math.floor(color[0])
      var g = Math.floor(color[1])
      var b = Math.floor(color[2])

      data[(j + i * wh) * 4] = r
      data[(j + i * wh) * 4 + 1] = g
      data[(j + i * wh) * 4 + 2] = b
      data[(j + i * wh) * 4 + 3] = 255
    }
  }

  // var texture = new THREE.DataTexture( data, wh, wh, THREE.RGBFormat )
  // texture.needsUpdate = true

  var imageData = new window.ImageData(data, wh, wh)

  var texture = new THREE.Texture(imageData)
  texture.needsUpdate = true
  return texture
}

var shaderMaterialFactory = function (stats) {
  // var testscale = chroma.scale(['red', 'ffffff',  'blue'])
  var testscale = chroma.scale('Spectral') // .correctLightness(true)

  var scaleMap = generateScaleMap(testscale, 64)

  var uniforms = {
    maxalt: {
      type: 'f',
      value: stats.maxAlt / 500
    },
    minalt: {
      type: 'f',
      value: stats.minAlt / 500
    },
    scalemap: {
      type: 't',
      value: scaleMap
    }
  }

  var shaderMat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    // attributes:     attributes,
    vertexShader: document.getElementById('vertexshader').textContent,
    fragmentShader: document.getElementById('fragmentshader').textContent,
    side: THREE.DoubleSide,
    wireframe: false,
    depthTest: true,
    depthWrite: true,
    transparent: true
  })

  shaderMat.linewidth = 1

  return shaderMat
}
// makes the line from the JSONpath
var parsedIGCToMesh = function (parsedIGC, material) {
  var JSONpath = parsedIGC.path
  // convert json to THREEvec3
  var vec3path = JSONpath.map(function (v) {
    return new THREE.Vector3(v[0], v[1], v[2])
  })

  var computeTangent = function (array) {
    var tangents = []
    for (var i = 0; i < array.length; i++) {
      var tangent
      var prev, curr, next, v1, v2
      if (i === 0) {
        curr = array[i]
        next = array[i + 1]
        v1 = curr.clone().sub(next)
        tangent = v1
      } else if (i === array.length - 1) {
        prev = array[i - 1]
        curr = array[i]
        v1 = prev.clone().sub(curr)
        tangent = v1
      } else {
        prev = array[i - 1]
        curr = array[i]
        next = array[i + 1]
        v1 = prev.clone().sub(curr).normalize()
        v2 = curr.clone().sub(next).normalize()
        tangent = v1.add(v2)
      }
      // tangent = new THREE.Vector3(1.0, 0.0, 0.0)
      tangent.normalize()
      tangents.push(tangent)
    }
    return tangents
  }
  var vec3TangentsArray = computeTangent(vec3path)

  var geometry = new THREE.BufferGeometry()

  var vertices = new Float32Array(JSONpath.length * 6)
  var tangent = new Float32Array(JSONpath.length * 6)
  var index = new Uint32Array(JSONpath.length * 6 + 1)
  var dir = new Float32Array(JSONpath.length * 2)
  var climb = new Float32Array(JSONpath.length * 2)

  var doubleArr = function (array) {
    return array.concat(array)
  }
  JSONpath.forEach(function (xyz, i) {
    var tanU = [vec3TangentsArray[i].x, vec3TangentsArray[i].z, vec3TangentsArray[i].y]
    tanU = doubleArr(tanU)
    tangent.set(tanU, i * 6)

    var vU = [xyz[0], xyz[2], xyz[1]]
    // maybe figure out why we need a 10x here?
    vU = vU.map(function (x) {
      return x * 10
    })
    vU = doubleArr(vU)
    vertices.set(vU, i * 6)

    climb.set([parsedIGC.climb[i], parsedIGC.climb[i]], i * 2)

    var iU = [i * 2 + 0, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]
    index.set(iU, i * 6)

    dir.set([-1.0, 1.0], i * 2)
  })

  index = index.slice(0, index.length - 6)

  // buffer geometry attributes are automatically acessible as attributes in the vertex shader
  geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.addAttribute('tangent', new THREE.BufferAttribute(tangent, 3))
  geometry.addAttribute('dir', new THREE.BufferAttribute(dir, 1))
  geometry.addAttribute('climb', new THREE.BufferAttribute(climb, 1))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))

  var mesh = new THREE.Mesh(geometry, material) // , THREE.LineStrip )

  var halfArr = function (typedarr, e) {
    var newArr = new typedarr.constructor(typedarr.length / 2)

    for (var i = 0; i < newArr.length; i = i + e) {
      for (var j = 0; j < e; j++) {
        newArr[i + j] = typedarr[i * 2 + j]
      }
    }
    return newArr
  }

  var halfv = halfArr(vertices, 3)

  var pickerGeometry = new THREE.BufferGeometry()
  pickerGeometry.addAttribute('position', new THREE.BufferAttribute(halfv, 3))
  var pickerMesh = new THREE.Line(pickerGeometry)

  pickerMesh.name = 'picker'
  pickerMesh.material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    transparent: true
  })
  //
  pickerMesh.material.opacity = 0
  mesh.add(pickerMesh)

  // this is a thing that tried and failed to implement a projected line onto the ground
  // should be resurrected when i can do it not shittily (render heightmap of the ground then sample that?)
  /*
     var projectionGeo = new THREE.BufferGeometry()

     var projector = new THREE.Raycaster()
     var down = new THREE.Vector3(0,-1,0)
     var ground = scene.getObjectByName("ground")
     vec3path.forEach(function(x,i){
     var pos = new THREE.Vector3(x.x*10,x.z*10+3.3,x.y*10)
     projector.set(pos,down)
     var t = projector.intersectObjects(scene.children)
     if (t.length > 0){
     console.log(t)
     }
     })
     */
  // mesh.visible = false
  return mesh
}

var updateSunPos = function (date) {
  var sunpos = SunCalc.getPosition(date, 37.828, -121.625)
  var azimuth = sunpos.azimuth
  var altitude = sunpos.altitude
  var r = 700
  var a = r * Math.cos(altitude)
  var z = a * Math.cos(azimuth)
  var y = r * Math.sin(altitude)
  var x = -a * Math.sin(azimuth)
  var light = scene.getObjectByName('sun')
  // (lr,ud,fb)
  light.position.set(x, y, z)
}

var addIGCToScene = function (parsedIGC, scene, name) {
  igc = parsedIGC
  state.index = 0
  makeGraph(igc)
  var shaderMaterial = shaderMaterialFactory(parsedIGC.stats)
  var pathObject = scene.getObjectByName(name)
  scene.remove(pathObject)
  pathObject = parsedIGCToMesh(igc, shaderMaterial)
  pathObject.position.y = 3
  pathObject.name = name
  scene.add(pathObject)
  updateSunPos(igc.stats.date)
}

var importLogic = function (rawfile) {
  var igc = IGCparser.parseToJSON(rawfile)
  // this is for debugging
  addIGCToScene(igc, scene, 'flightpath')
  scene.getObjectByName('flightpath').scale.y = 2
}

if (window.FileReader) {
  var filedrop = document.getElementById('filedrop')

  var cancel = function (e) {
    if (e.preventDefault) {
      e.preventDefault()
    }
    return false
  }

  window.addEventListener('dragenter', function (e) {
    e.preventDefault()
    filedrop.style.display = 'block'
  }, false)
  window.addEventListener('drop', cancel, false)
  window.addEventListener('dragover', cancel, false)

  filedrop.addEventListener('dragleave', function (e) {
    e.preventDefault()
    filedrop.style.display = 'none'
  }, false)

  filedrop.addEventListener('drop', function (e) {
    if (e.preventDefault) {
      e.preventDefault()
    }

    var dt = e.dataTransfer
    var files = dt.files
    var onload = function (event) {
      var object = event.target.result
      importLogic(object)
    }

    for (var i = 0; i < files.length; i++) {
      var file = files[i]
      var reader = new window.FileReader()
      reader.onload = onload
      reader.readAsText(file)
      filedrop.style.display = 'none'
    }
    return false
  })
} else {
  document.getElementById('filedrop').innerHTML = 'Your browser does not support the HTML5 FileReader.'
}

var sideToggle = function () { // eslint-disable-line
  var element = document.getElementById('sidebar')
  if (element.classList.contains('sidebarhide') === true) {
    element.classList.remove('sidebarhide')
  } else {
    element.classList.add('sidebarhide')
  }
}

var makeGraph = function (igc) {
  d3.select('svg').remove()

  var data = igc.path.map(function (d, i) {
    return [d[2] * 1000, new Date(igc.date - -igc.time[i])]
  })

  var boxWidth = document.getElementById('graph').clientWidth
  var boxHeight = document.getElementById('graph').clientHeight

  var margin = {
    top: 20,
    right: 20,
    bottom: 30,
    left: 50
  }
  var width = boxWidth * 0.718 - margin.left - margin.right
  var height = boxHeight - margin.top - margin.bottom

  var timeExtent = d3.extent(data, function (x) {
    return x[1]
  })
  // in meters
  var altExtent = d3.extent(data, function (x) {
    return x[0]
  })

  var bisectDate = d3.bisector(function (d) {
    return d[1]
  }).left

  var line = d3.svg.line()
    .x(function (d) {
      return x(d.date)
    })
    .y(function (d) {
      return y(d.close)
    })

  var x = d3.time.scale()
    .range([0, width])

  var y = d3.scale.linear()
    .range([height, 0])

  var xAxis = d3.svg.axis()
    .scale(x)
    .ticks(8)
    .orient('bottom')

  var yAxis = d3.svg.axis()
    .scale(y)
    .ticks(4)
    .orient('left')

  var line = d3.svg.line()
    .x(function (d) {
      return x(d[1])
    })
    .y(function (d) {
      return y(d[0])
    })

  x.domain(timeExtent)
  y.domain(altExtent)

  var svg = d3.select('#graph').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

  svg.append('g')
    .attr('class', 'x axis')
    .attr('transform', 'translate(0,' + height + ')')
    .call(xAxis)

  svg.append('g')
    .attr('class', 'y axis')
    .call(yAxis)
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 6)
    .attr('dy', '.61em')
    // .style("text-anchor", "end")
    // .text("Alt (m)")

  svg.append('path')
    .datum(data)
    .attr('class', 'line')
    .attr('d', line)

  var mousemove = function () {
    var x0 = x.invert(d3.mouse(this)[0])
    if (state.mouse.buttons === 1){
      state.index = bisectDate(data, x0, 1)
      updateCurrent(state.index)
    }
  }
  svg.append('rect')
    .attr('class', 'overlay')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'rgba(0,0,0,0)')
    .on('mousemove', mousemove)
}

function init () {
  container = document.createElement('div')
  document.body.appendChild(container)

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3000)
  camera.position.set(277, 180, 25)

  // scene
  scene = new THREE.Scene()

  // set up loading manager
  var manager = new THREE.LoadingManager()
  manager.onProgress = function (item, loaded, total) {
    console.log(item, loaded, total)
  }

  var onProgress = function (xhr) {
    if (xhr.lengthComputable) {
      var percentComplete = xhr.loaded / xhr.total * 100
      console.log(Math.round(percentComplete, 2) + '% downloaded')
    }
  }

  var onError = function (xhr) {}

  /* texture
  var texture = new THREE.Texture()
  var Imageloader = new THREE.ImageLoader(manager)

  Imageloader.load('cut.png', function (image) {
    texture.image = image
    texture.needsUpdate = true
  })
 */

  var skyLight = new THREE.HemisphereLight(0xa6d4ff, 0x080600, 2)
  scene.add(skyLight)

  var sunLight = new THREE.DirectionalLight(0xffeab8, 4)
  sunLight.target.position.set(0, 0, 0)
  // shadows are nice but very expensive
  sunLight.castShadow = true
  sunLight.shadow.camera.near = 10
  sunLight.shadow.camera.far = 1400
  sunLight.shadow.camera.left = -700
  sunLight.shadow.camera.right = 700
  sunLight.shadow.camera.top = 700
  sunLight.shadow.camera.bottom = -700
  sunLight.shadow.mapSize.width = 4096
  sunLight.shadow.mapSize.width = 4096
  sunLight.name = 'sun'

  scene.add(sunLight)
  // var helper = new THREE.CameraHelper( light.shadow.camera )
  // scene.add( helper )
  scene.fog = new THREE.FogExp2(0xa6d4ff, 0.0005)

  // load ground model
  var OBJloader = new THREE.OBJLoader(manager)

  OBJloader.load('ground-s.obj', function (object) {
    object.traverse(function (child) {
      if (child instanceof THREE.Mesh) {
        var material = new THREE.MeshStandardMaterial({
          color: 0x111314,
          wireframe: false,
          shading: THREE.FlatShading,
          roughness: 0.8,
          metalness: 0
        })
        child.name = 'ground'
        child.material = material
        child.scale.y = 2
        child.position.y = 0
        child.castShadow = true
        child.receiveShadow = true

        scene.add(child)
        // IGC test file (not needed for drag and drop)
        var IGCloader = new THREE.XHRLoader(manager)

        IGCloader.load('test.igc', function (object) {
          importLogic(object)
        }, onProgress, onError)
      }
    })
  }, onProgress, onError)

  // makes the sphere that serves as a pointer on the flight path
  var indicatorLine = new THREE.BufferGeometry()
  var indicatorVerts = new Float32Array(6)
  indicatorVerts.set([0, 0, 0, 0, -1000, 0])
  var geometry = new THREE.BufferGeometry()
  geometry.addAttribute('position', new THREE.BufferAttribute(indicatorVerts, 3))
  var material = new THREE.LineBasicMaterial({
    color: 0xffffff
  })
  indicatorObject = new THREE.Line(geometry, material)
  indicatorObject.name = 'indicator'
  var light = new THREE.PointLight(0xfffeed, 1, 200, 2)
  light.name = 'indicatorlight'
  indicatorObject.add(light)
  indicatorObject.material.depthTest = true
  indicatorObject.material.side = THREE.DoubleSide
  indicatorObject.visible = false
  scene.add(indicatorObject)

  // renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    maxLights: 24
  })
  renderer.shadowMap.enabled = false
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // renderer.shadowMapCascade = true
  renderer.setClearColor(0x000000, 1)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  controls = new THREE.OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
  // controls.maxPolarAngle = 1.56
  controls.rotateSpeed = 0.3
  container.appendChild(renderer.domElement)

  // raycaster
  raycaster = new THREE.Raycaster()
  raycaster.linePrecision = 3

  // event listeners
  window.addEventListener('resize', onWindowResize, false)
  scene.addEventListener('mousemove', onDocumentMouseMove, false)
  document.addEventListener('dblclick', onDoubleClick, false)
  document.addEventListener('mousedown', onMDown, false)
  document.addEventListener('mouseup', onMUp, false)
}

function onMUp (e) {
  state.mouse.buttons = e.buttons
  state.mouse.button = e.button
}
function onMDown (e) {
  state.mouse.buttons = e.buttons
  state.mouse.button = e.button
  raycaster.setFromCamera(state.mouse, camera)
  var picker = scene.getObjectByName('picker')
  if (picker) {
    var intersects = raycaster.intersectObject(picker, true)
    if (intersects.length > 0) {
      state.index = intersects[0].index
    }
    updateCurrent(state.index)
  }
}

function onWindowResize () {
  windowHalfX = window.innerWidth / 2
  windowHalfY = window.innerHeight / 2

  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)
  makeGraph(igc)
}

function onDocumentMouseMove (event) {
  event.preventDefault()
  state.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  state.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
}

function onDoubleClick (event) {
  var picker = scene.getObjectByName('picker')
  var index = state.index
  var ppos = picker.geometry.attributes.position.array
  var pos = new THREE.Vector3(ppos[index * 3], ppos[index * 3 + 1], ppos[index * 3 + 2])
  pos = pos.multiply(picker.parent.scale).add(picker.parent.position)
  controls.target = pos
}

var updateCurrent = function (index) {
  var picker = scene.getObjectByName('picker')
  var spect = chroma.scale('Spectral') // .correctLightness(true)
  var c = spect(1 - ((igc.climb[index] / 5.0) + 0.5))
  var light = scene.getObjectByName('indicatorlight')
  light.color.setRGB.apply(light.color, c.rgb().map(e => e / 255))
  var indicator = scene.getObjectByName('indicator')
  var ppos = picker.geometry.attributes.position.array
  var pos = new THREE.Vector3(ppos[index * 3], ppos[index * 3 + 1], ppos[index * 3 + 2])
  pos = pos.multiply(picker.parent.scale).add(picker.parent.position)
  indicator.visible = true
  indicator.position.copy(pos)
  document.getElementById('altitude').innerText = igc.path[index][2] * 1000 + 'm'
  document.getElementById('climb').innerText = Math.round(igc.climb[index] * 8) / 8 + 'm/s'
  var now = new Date(igc.date - -igc.time[index])
  document.getElementById('time').innerText = now.toLocaleTimeString()
  updateSunPos(now)
}

var render = function () {
  controls.update()

  renderer.render(scene, camera)
}

var animate = function () {
  window.requestAnimationFrame(animate)
  render()
}

init()
animate()
