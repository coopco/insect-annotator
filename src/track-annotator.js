import * as utils from './utils.js'

class Track {
  constructor(id) {
    this.id = id
    this.marked = false
    this.head = undefined
    this.selected = false
  }

  getBoxAtFrame(frameId) {
    let node = this.head
    while (node != undefined) {
      if (node.frameId == frameId) return node
      node = node.next
    }
    return undefined
  }

  removeBox(frameId) {
    let node = this.getBoxAtFrame(frameId)
    if (node.prev && node.next) {
      node.prev.next = node.next
      node.next.prev = node.prev
    } else if (node.next) {
      this.head = node.next
      node.next.prev = undefined
    } else if (node.prev) {
      node.prev.next = undefined
    }
  }

  // Only returns newTrack if new track is created
  splitAtFrame(frameId) {
    let node = this.getBoxAtFrame(frameId);
    let newTrack;

    if (node === undefined) {
      return
    }

    if (node.prev && node.next) {
      node.prev.next = undefined
      node.prev = undefined
      newTrack = new Track(-1)
      newTrack.head = node
      while (node != undefined) {
        node.track = newTrack
        node = node.next
      }
    } else if (node.next) {
      return undefined
    } else if (node.prev) {
      node.prev.next = undefined
      return undefined
    }

    return newTrack
  }

  getTrackTail() {
    let node = this.head
    while(true) {
      if (node.next === undefined)
        break
      node = node.next
    }
    return node
  }

  getFrameIds() {
    let node = this.head
    let ids = []
    while(node !== undefined) {
      ids.push(node.frameId)
      node = node.next
    }
    return ids
  }

  getBoxes() {
    let node = this.head
    let nodes = []
    while (node !== undefined) {
      nodes.push(node)
      node = node.next
    }
    return nodes
  }
}

class Box {
  constructor (frameId, track, x, y, w, h) {
    this.frameId = frameId
    this.track = track
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.prev = undefined
    this.next = undefined
  }

  getBox () {
    return [this.x, this.y, this.w, this.h]
  }

  getDot () {
    let x = this.x
    let y = this.y
    let w = this.w
    let h = this.h
    return [(x+x+w)/2, (y+y+h)/2]
  }

  checkIfInside(x, y) {
    let value = this.getBox()
    return x >= value[0] && x <= value[0] + value[2] && y >= value[1] && y <= value[1] + value[3]
  }

  checkIfInsideDot(x, y) {
    let value = this.getDot()
    let x1 = value[0] - 5
    let x2 = value[0] + 5
    let y1 = value[1] - 5
    let y2 = value[1] + 5
    return x >= x1 && x <= x2 && y >=y1 && y <= y2
  }
}


export class TrackAnnotator {
  constructor(canvas, frameCount, textOutput) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.frameCount = frameCount
    this.textOutput = textOutput
    this.BOX_WIDTH = 75
    this.BOX_HEIGHT = 75
    this.currentFrameIndex = 0

    this.trackIds = []
    this.trackColors = {}
    // this.currentBBoxes = {}
    this.currentImage = null

    this.csvData = []

    this.dotMode = false
    this.nearByOnly = false
    this.interpolation = false
    this.trackOnly = false

    this.tracks = []
    this.currentBoxes = []
    // TODO handle better
    this.range = document.getElementById('range_scroll')
    this.video = document.getElementById('video');
    this.source = document.getElementById('currentVID');
    this.FRAMERATE = 15;
    this.vidDuration = 30;
    this.nearbyDistance = 50;
    this.undoPoint = [];
  }

  toggleInterpolation () {
    this.interpolation = !this.interpolation
    this.redrawCanvas()
  }

  toggleShowTrackMode() {
    this.trackOnly = !this.trackOnly
    this.redrawCanvas()
  }

  toggleShowMode() {
    this.nearByOnly = !this.nearByOnly
    this.redrawCanvas()
  }

  toggleDotMode() {
    this.dotMode = !this.dotMode
    this.redrawCanvas()
  }

  async init () {
    this.initTracks()
    await this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  initTracks() {
    let csvData = this.csvData
    let trackIds = csvData.map(e => e[1]).filter((e, index, arr) => arr.indexOf(e) === index)
    this.tracks = []
    for (var i = 0; i < trackIds.length; i++) {
      let trackId = trackIds[i]
      let detections = csvData.filter(e => e[1] === trackId).sort((a, b) => {
        return (a[0] > b[0]) ? 1 : ((b[0] > a[0]) ? -1 : 0)
      })
      //let track = new Point(...detections[0])
      trackId = detections[0][1]
      let track = new Track(trackId)
      // TODO ugly
      detections[0][1] = track
      let prevNode = new Box(...detections[0])
      track.head = prevNode
      for (var j = 1; j < detections.length; j++) {
        detections[j][1] = track
        let node = new Box(...detections[j])
        prevNode.next = node
        node.prev = prevNode
        prevNode = node
      }
      this.tracks.push(track)
      this.trackIds.push(trackId)
      this.trackColors[trackId] = utils.getRandomColor()
    }
  }

  restoreTrack(id) {
    let csvData = this.csvData
    let detections = csvData.filter(e => e[1].id === id).sort((a, b) => {
      return (a[0] > b[0]) ? 1 : ((b[0] > a[0]) ? -1 : 0)
    })
    //let track = new Point(...detections[0])
    let trackId = detections[0][1].id
    let track = new Track(trackId)
    // TODO ugly
    detections[0][1] = track
    let prevNode = new Box(...detections[0])
    track.head = prevNode
    for (var j = 1; j < detections.length; j++) {
      detections[j][1] = track
      let node = new Box(...detections[j])
      prevNode.next = node
      node.prev = prevNode
      prevNode = node
    }
    this.tracks.push(track)
    this.redrawCanvas()
  }

  revertTrack(track) {
    let id = track.id
    this.deleteTrack(track)
    this.restoreTrack(id)
  }

  async loadCurrentFrameData () {
    let index = this.currentFrameIndex

    // Adding 0.0001 seems to avoid rounding errors
    this.video.currentTime = index / this.FRAMERATE + 0.0001
  }

  drawBackground () {
    this.ctx.drawImage(this.video, 0, 0, this.video.width, this.video.height);
  }

  drawBox(x, y, w, h, color="gray") {
    this.ctx.beginPath();
    this.ctx.lineWidth = "3";
    this.ctx.strokeStyle = color;
    this.ctx.rect(x - w/2, y - h/2, w, h);
    this.ctx.stroke();
  }

  drawBBoxes () {
    let selectedBoxes = this.getSelectedBoxes()
    let numSelected = this.getSelectedTracks().length
    for (let i = 0; i < this.currentBoxes.length; i++) {
      let box = this.currentBoxes[i]
      let trackId = box.track.id
      let coords = box.getBox()
      let dot = box.getDot()

      // If displaying only marked tracks
      if (this.trackOnly && !box.track.marked) {
        continue
      }

      // TODO for each selected track
      if (numSelected > 0 && this.nearByOnly) {
        let distances = selectedBoxes.map(e => {
          let eDot = e.getDot()
          return (eDot[0]-dot[0])**2 + (eDot[1]-dot[1])**2
        })

        if (Math.sqrt(Math.min(...distances)) > this.nearbyDistance) {
          continue
        }
      }

      if (!this.dotMode) {
        this.ctx.beginPath();
        this.ctx.lineWidth = "3";
        this.ctx.strokeStyle = `#${this.trackColors[trackId]}`
        this.ctx.rect(...coords);
        this.ctx.stroke();
        this.ctx.font = "20px Arial";
        this.ctx.fillStyle = "blue";
        this.ctx.fillText(String(trackId), coords[0], coords[1]);

        // Indicate if box is marked
        if (box.track.marked) {
          this.ctx.beginPath();
          this.ctx.lineWidth = "2";
          this.ctx.strokeStyle = "red";
          this.ctx.moveTo(coords[0] + coords[2] - coords[2]/10, coords[1])
          this.ctx.lineTo(coords[0] + coords[2], coords[1])
          this.ctx.lineTo(coords[0] + coords[2], coords[1] + coords[3]/10)
          this.ctx.stroke()
        }
      } else {
        this.ctx.beginPath();
        this.ctx.arc(dot[0], dot[1], 5, 0, 2 * Math.PI, false);
        this.ctx.fillStyle = `#${this.trackColors[trackId]}`
        this.ctx.fill();

        // Indicate if box is marked
        if (box.track.marked) {
          this.ctx.beginPath();
          this.ctx.arc(dot[0], dot[1], 2, 0, 2 * Math.PI, false);
          this.ctx.fillStyle = "red"
          this.ctx.fill();
        }
      }

      if (box.track.selected) {
        this.ctx.beginPath();
        this.ctx.lineWidth = "1";
        if (numSelected == 1) {
          this.ctx.strokeStyle = "red";
        } else {
          this.ctx.strokeStyle = "green";
        }
        if (this.dotMode) {
          this.ctx.strokeStyle = `#${this.trackColors[trackId]}`
        }
        this.ctx.rect(coords[0]-5, coords[1]-5, coords[2]+10, coords[3]+10);
        this.ctx.stroke();
      }
    }
  }

  redrawCanvas () {
    let index = this.currentFrameIndex
    this.currentBoxes = this.tracks.map(e => e.getBoxAtFrame(index)).filter(e => e !== undefined)
    this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height);
    //this.loadCurrentFrameData()
    this.drawBackground()
    this.drawBBoxes()
    this.updateText()
    // Update ui stuff
    this.range.value = this.currentFrameIndex;
  }

  async goToNextFrame() {
    if (this.currentFrameIndex +1 >= this.frameCount) return
    this.currentFrameIndex += 1
    await this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  async goToPreviousFrame() {
    if (this.currentFrameIndex <= 0) return
    this.currentFrameIndex -= 1
    await this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  async goToFirstFrame() {
    this.currentFrameIndex = 0
    await this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  async goToLastFrame() {
    this.currentFrameIndex = this.frameCount - 1
    await this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  async goToFrame(index) {
    this.currentFrameIndex = index
    await this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  updateText() {
    this.textOutput.textContent = `Frame index: ${this.currentFrameIndex}/${this.frameCount-1}`
  }

  parseCsvData(rawData) {
    let lines = rawData.split('\n')
    let maxImageId = -1
    let csv = lines.filter(line => line.length > 0 && !line.includes('image_id')).map(line => {
      let e = line.split(',')
      maxImageId = Math.max(maxImageId, Number(e[0]))
      return [Number(e[0]), Number(e[1]), Number(e[2]), Number(e[3]), Number(e[4]), Number(e[5])]
    })

    return csv
  }

  // TODO clean up this code
  updateUndoPoint(onlyMarked = false) {
    let csvRecords = [["image_id", "track_id", "x", "y", "w", "h"]]
    let tracks = onlyMarked ? this.tracks.filter(track => track.marked) : this.tracks
    // If no tracks marked, download all
    if (tracks.length == 0) {
      tracks = this.tracks
    }

    tracks.map(track => {
      let node = track.head
      while (node !== undefined) {
        csvRecords.push([
          node.frameId, track.id, node.x, node.y, node.w, node.h
        ])
        node = node.next
      }
    })

    let csvContent = csvRecords.map(e => e.join(",")).join("\n");

    this.undoPoint = csvContent
  }

  exportCsvData(onlyMarked = false) {
    let csvRecords = [["image_id", "track_id", "x", "y", "w", "h"]]
    let tracks = onlyMarked ? this.tracks.filter(track => track.marked) : this.tracks
    // If no tracks marked, download all
    if (tracks.length == 0) {
      tracks = this.tracks
    }

    tracks.map(track => {
      let node = track.head
      while (node !== undefined) {
        csvRecords.push([
          node.frameId, track.id, node.x, node.y, node.w, node.h
        ])
        node = node.next
      }
    })

    let csvContent = csvRecords.map(e => e.join(",")).join("\n");
    saveFile("export.csv", "data:text/csv", new Blob([csvContent],{type:""}));

    function saveFile (name, type, data) {
      if (data != null && navigator.msSaveBlob)
        return navigator.msSaveBlob(new Blob([data], { type: type }), name);

      var a = $("<a style='display: none;'/>");
      var url = window.URL.createObjectURL(new Blob([data], {type: type}));
      a.attr("href", url);
      a.attr("download", name);
      $("body").append(a);
      a[0].click();
      setTimeout(function(){  // fixes firefox html removal bug
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 500);
    }
  }

  getBoxAtXY(x, y) {
    let selectedBox = null
    for (let box of this.currentBoxes) {
      if (this.dotMode) {
        if (box.checkIfInsideDot(x, y)) {
          selectedBox = box
          break
        }
      } else {
        if (box.checkIfInside(x, y)) {
          selectedBox = box
          break
        }
      }
    }

    return selectedBox
  }

  deleteBox(box) {
    // TODO if newTrack returns undefined
    let newTrack = box.track.splitAtFrame(box.frameId)
    let id = box.track.id
    let trackIds = this.trackIds
    if (newTrack) {
      newTrack.id = Math.max(...trackIds) + 1
      id = newTrack.id
      this.trackIds.push(newTrack.id)
      this.trackColors[newTrack.id] = utils.getRandomColor()
      this.tracks.push(newTrack)
      newTrack.removeBox(box.frameId)
    } else if (box.next) {
      // TODO kind of ugly
      box.track.removeBox(box.frameId)
    }
    this.currentBoxes = this.currentBoxes.filter(e => {
      return !(e.track.id === id)
    })
  }

  deleteTrack(track) {
    this.tracks = this.tracks.filter(e => {
      return !(e.id == track.id)
    })
    this.currentBoxes = this.currentBoxes.filter(e => {
      return !(e.track.id == track.id)
    })
    this.redrawCanvas()
  }

  deleteSelectedBoxes() {
    this.currentBoxes.filter(e => {
      return e.track.selected
    }).map(e => {
      // e.track.selected = false
      this.deleteBox(e)
    })
    this.redrawCanvas()
  }

  deleteSelectedTracks() {
    this.tracks = this.tracks.filter(e => {
      return !e.selected
    })
    this.currentBoxes = this.currentBoxes.filter(e => {
      return !e.track.selected
    })
    this.redrawCanvas()
  }

  markSelected() {
    this.getSelectedTracks().forEach(e => {
      e.marked = !e.marked
    })
    this.redrawCanvas()
  }

  clearMarked() {
    this.tracks.forEach(e => {
      e.marked = false
    })
    this.redrawCanvas()
  }

  mergeSelected() {
    // TODO Handle more than 2 tracks selected
    let selected = this.getSelectedTracks()
    if (selected.length == 2) {
      this.mergeTracks(...selected)
    } else {
      alert("Must select exactly 2 tracks to merge. Try clearing your selection.")
    }
  }

  mergeTracks(track1, track2) {
    // TODO handle when tracks are interwoven without overlap?
    // TODO Change alert to visual indicator on canvas?
    let firstTrack, secondTrack, tail
    let tail1 = track1.getTrackTail()
    let tail2 = track2.getTrackTail()

    // Figure out which track comes first
    if (tail1.frameId < tail2.frameId) {
      firstTrack = track1
      tail = tail1
      secondTrack = track2
    } else {
      firstTrack = track2
      tail = tail2
      secondTrack = track1
    }

    // If overlapping
    //if (tail.frameId >= secondTrack.head.frameId) {
    //  alert(`Must fix track overlap between frames ${secondTrack.head.frameId} and ${tail.frameId} (inclusive)`)
    //  return
    //}

    // Merge head and tail
    let head = secondTrack.head
    head.prev = tail
    tail.next = head

    // Update track of nodes
    let node = head
    while (node != undefined) {
      node.track = firstTrack
      node = node.next
    }

    this.deleteTrack(secondTrack)
    this.redrawCanvas()
  }

  addBox(x, y) {
    let newTrackId = Math.max(...this.trackIds, -1) + 1
    this.trackIds.push(newTrackId)
    this.trackColors[newTrackId] = utils.getRandomColor()
    // If new track
    let track = new Track(newTrackId)
    this.tracks.push(track)
    let node = new Box(this.currentFrameIndex, track, (x-this.BOX_WIDTH/2),
        (y-this.BOX_HEIGHT/2), this.BOX_WIDTH, this.BOX_HEIGHT)
    this.currentBoxes.push(node)

    // If new track
    track.head = node

    let selected = this.getSelectedTracks()
    // If only one track selected and it is not in current frame
    if (selected.length == 1 && !(selected[0].getBoxAtFrame(this.currentFrameIndex))) {
      this.mergeTracks(selected[0], track)
      if (this.interpolation) {
        this.interpolate(node.prev, node)
      }
    } else {
      // Select box if adding new track
      track.selected = true;
    }

    this.redrawCanvas()
  }

  clearSelection() {
    this.tracks.map(e => {
      e.selected = false
    })
    this.redrawCanvas()
  }

  getSelectedBoxes() {
    let selected = this.currentBoxes.filter(e => {
      return e.track.selected
    })
    return selected
  }

  getSelectedTracks() {
    let selected = this.tracks.filter(e => {
      return e.selected
    })
    return selected
  }

  interpolate(box1, box2) {
    let track  = box1.track
    let prevNode = box1
    let nFrames = box2.frameId - box1.frameId
    let stepX = (box2.x - box1.x) / nFrames
    let stepY = (box2.y - box1.y) / nFrames
    let stepW = (box2.w - box1.w) / nFrames
    let stepH = (box2.h - box1.h) / nFrames
    for (let i = 1; i < nFrames; i++) {
      let node = new Box(box1.frameId+i, track, box1.x+stepX*i, box1.y+stepY*i,
                         box1.w+stepW*i, box1.h+stepH*i)
      node.prev = prevNode
      prevNode.next = node
      prevNode = node
    }
    box2.prev = prevNode
    prevNode.next = box2
  }

  moveBox(box, x, y) {
    let xNew = x  - box.w / 2
    let yNew = y  - box.h / 2
    box.x = xNew
    box.y = yNew
    this.redrawCanvas()
  }

  deletePreviousSelected() {
    this.getSelectedTracks().forEach(e => {
      let box = e.getBoxAtFrame(this.currentFrameIndex)
      if (box) {
        if (box.next) {
          e.head = box.next
        } else {
          this.deleteTrack(track)
        }
      } else {
        // TODO delete tracks not in current frame?
      }
    })
    this.currentBoxes = this.currentBoxes.filter(e => {
      return !(e.track.selected)
    })
    this.redrawCanvas()
  }

  deleteNextSelected() {
    this.getSelectedTracks().forEach(e => {
      let box = e.getBoxAtFrame(this.currentFrameIndex)
      if (box) {
        if (box.prev) {
          box.prev.next = undefined
        } else {
          this.deleteTrack(track)
        }
      } else {
        // TODO delete tracks not in current frame?
      }
    })
    this.currentBoxes = this.currentBoxes.filter(e => {
      return !(e.track.selected)
    })
    this.redrawCanvas()
  }

  updateAnnotations(csvData) {
    this.csvData = csvData
    this.initTracks()
    this.loadCurrentFrameData()
    this.redrawCanvas()
  }

  updateVideo(video) {
  }

  selectedSizeDown() {
    this.getSelectedBoxes().forEach(e => {
      e.x = e.x + e.w/22
      e.y = e.y + e.h/22
      e.w = e.w/1.1
      e.h = e.h/1.1
    })
    this.redrawCanvas()
  }

  selectedSizeUp() {
    this.getSelectedBoxes().forEach(e => {
      e.x = e.x - 0.05*e.w
      e.y = e.y - 0.05*e.h
      e.w = e.w*1.1
      e.h = e.h*1.1
    })
    this.redrawCanvas()
  }
}

