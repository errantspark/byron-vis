var parser = function () {
  var that = this

  this.parseIGC = function (igc) {
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
    path = path.filter(e => e !== 'GARBAGE!')

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

  this.parseToJSON = function (data) {
    var output = {}
    var stats = {}

    var parse = that.parseIGC(data)

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

}
