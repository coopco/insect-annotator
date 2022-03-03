import {TrackAnnotator} from "./track-annotator.js"

let range;

let canvas = document.getElementById('canvas')
let pText = document.getElementById('current_frame')
let pState = document.getElementById('p_state')
let ctx = canvas.getContext('2d');
let taskName = 'CU10L1B1In_0'
let publicDir = `./public/refining_v3/${taskName}`
let frameCount = 500
let correctionFlag = true

let annotator = new TrackAnnotator(publicDir, canvas, frameCount, pText, correctionFlag, taskName)
await annotator.init()

let field_id = document.getElementById('field_id')
let field_color = document.getElementById('field_color')
let field_width = document.getElementById('field_width')
let field_height = document.getElementById('field_height')
field_width.value = annotator.BOX_WIDTH
field_height.value = annotator.BOX_HEIGHT
let field_fps = document.getElementById('field_fps')
field_fps.value = annotator.FRAMERATE
let mouseX, mouseY;
let previewBox = false;

document.getElementById('chkbox_interpolation_mode').checked = false
document.getElementById('chkbox_dot_mode').checked = false
document.getElementById('chkbox_show_mode').checked = false
document.getElementById('chkbox_show_track_mode').checked = false
let chkbox_interpolate_size = document.getElementById('chkbox_interpolate_size')
chkbox_interpolate_size.checked = true

document.addEventListener('keydown', async function (e) {
  // e.preventDefault()
  let keyCode = event.keyCode
  switch (keyCode) {
    case 17:
      previewBox = true
      break;
    case 68:
      await annotator.goToNextFrame();
      break;
    case 65:
      await annotator.goToPreviousFrame();
      break;
    default:
      break;
  }
});

document.addEventListener('keyup', async function (e) {
  // e.preventDefault()
  let keyCode = event.keyCode
  switch (keyCode) {
    case 17:
      previewBox = false
      break;
    default:
      break;
  }
});

document.getElementById('btn_ant_track_down').addEventListener('click', function (e) {
  annotator.exportCsvData(true)
})
document.getElementById('btn_track_down').addEventListener('click', function (e) {
  annotator.exportCsvData(false)
})
document.getElementById('btn_first_frame').addEventListener('click', async function (e) {
  await annotator.goToFirstFrame()
})
document.getElementById('btn_last_frame').addEventListener('click', async function (e) {
  await annotator.goToLastFrame()
})
document.getElementById('chkbox_dot_mode').addEventListener('change', function (e) {
  annotator.toggleDotMode()
})
document.getElementById('chkbox_show_mode').addEventListener('change', function (e) {
  annotator.toggleShowMode()
})
document.getElementById('chkbox_show_track_mode').addEventListener('change', function (e) {
  annotator.toggleShowTrackMode()
})
document.getElementById('chkbox_interpolation_mode').addEventListener('change', function (e) {
  annotator.toggleInterpolation()
})
document.getElementById('range_scroll').addEventListener('input', function (e) {
  let frameId = Number(document.getElementById('range_scroll').value)
  annotator.goToFrame(frameId)
})
document.getElementById('text_field_frame').addEventListener('keydown', function (e) {
  if(e.key === 'Enter') {
    let value = Number(document.getElementById('text_field_frame').value)
    console.log(value)
    annotator.goToFrame(value)
    // alert(ele.value);
  }
})
document.getElementById('text_field_frame').addEventListener('input', function (e) {
  let value = Number(document.getElementById('text_field_frame').value)
  console.log(value)
  annotator.goToFrame(value)
})


function parseCsvData(rawData) {
  let lines = rawData.split('\n')
  let maxImageId = -1
  let csv = lines.filter(line => line.length > 0 && !line.includes('image_id')).map(line => {
    let e = line.split(',')
    maxImageId = Math.max(maxImageId, Number(e[0]))
    return [Number(e[0]), Number(e[1]), Number(e[2]), Number(e[3]), Number(e[4]), Number(e[5])]
  })

  console.log(csv)
  return csv
}

document.getElementById('videofile').addEventListener('change', async function (e) {
  const file = event.target.files[0];
  annotator.source.src = URL.createObjectURL(file);

  annotator.video.load();
  await new Promise((resolve) => {
    annotator.video.onloadeddata = () => {
      resolve(video);
    };
  });

  const videoWidth = annotator.video.videoWidth;
  const videoHeight = annotator.video.videoHeight;
  // Must set below two lines, otherwise video element doesn't show.
  annotator.video.width = videoWidth;
  annotator.video.height = videoHeight;
  annotator.canvas.width = videoWidth;
  annotator.canvas.height = videoHeight;

  timerCallback()

  annotator.frameCount = Math.round(annotator.video.duration * annotator.FRAMERATE)
  console.log(annotator.frameCount)
  document.getElementById("range_scroll").max = annotator.frameCount - 1
  //document.getElementById("range_scroll").style.width = `${videoWidth}px`

  console.log('Video is loaded.')
})

// TODO put somehwere better
function timerCallback() {
  annotator.redrawCanvas()
  if (previewBox) {
    let l = annotator.BOX_HEIGHT
    let w = annotator.BOX_WIDTH
    annotator.drawBox(mouseX, mouseY, w, l)
  }
  requestAnimationFrame(timerCallback)
}

function updateText() {
  let selected = annotator.getSelectedTracks()
  let trackText = selected.map(e => {
    return `ID: ${e.id}, Frames ${e.head.frameId}-${e.getTrackTail().frameId}`
  })
  pState.textContent = `Selected Tracks:\n ${trackText.join('\n ')}`
  if (selected.length > 1) {

  } else if (selected.length == 1) {

  } else { // None selected

  }
}

function updateUi() {
  let selected = annotator.getSelectedTracks()

  if (selected.length > 1) {
    field_id.disabled = true
  } else if (selected.length == 1) {
    let box = selected[0].getBoxAtFrame(annotator.currentFrameIndex)
    if (box) {
      field_width.value = box.w
      field_height.value = box.h
    }
    field_id.value = selected[0].id
    field_id.disabled = false
  } else { // None selected
    field_id.disabled = true
  }
}

document.getElementById('annotationfile').addEventListener('change', async function (e) {
  let file = event.target.files[0];
  let reader = new FileReader();
  reader.onload = function() {
    annotator.updateAnnotations(parseCsvData(reader.result))
  }
  reader.readAsText(file)
})

document.getElementById('btn_delete_boxes').addEventListener('click', (e) => {
  annotator.deleteSelectedBoxes()
})

document.getElementById('btn_delete_tracks').addEventListener('click', (e) => {
  annotator.deleteSelectedTracks()
})

document.getElementById('btn_merge_tracks').addEventListener('click', (e) => {
  annotator.mergeSelected()
})

document.getElementById('btn_mark_tracks').addEventListener('click', (e) => {
  annotator.markSelected()
})

document.getElementById('btn_delete_prev').addEventListener('click', (e) => {
  annotator.deletePreviousSelected()
})

document.getElementById('btn_delete_next').addEventListener('click', (e) => {
  annotator.deleteNextSelected()
})

document.getElementById('btn_clear_marked').addEventListener('click', (e) => {
  annotator.clearMarked()
})

document.getElementById('btn_revert_tracks').addEventListener('click', (e) => {
  console.log(annotator.csvData)
})

function updateSize(width, height) {
  let selected = annotator.getSelectedTracks()
  if (selected.length == 0) {
    annotator.BOX_WIDTH = width
    annotator.BOX_HEIGHT = height
  } else {
    annotator.BOX_WIDTH = width
    annotator.BOX_HEIGHT = height
    if (chkbox_interpolate_size.checked) {
      selected.forEach(e => {
        e.getBoxes().forEach(e => {
          e.w = width
          e.h = height
        })
      })
    } else {
      selected.forEach(e => {
        let box = e.getBoxAtFrame(annotator.currentFrameIndex)
        if (box) {
          box.w = width
          box.h = height
          console.log(box.getBox())
        }
      })
    }
  }
  updateUi()
}

document.getElementById('btn_size_update').addEventListener('click', (e) => {
  // TODO error handling?
  let width = Number(field_width.value)
  let height = Number(field_height.value)
  updateSize(width, height)
})

field_width.addEventListener('input', (e) => {
  let width = Number(field_width.value)
  let height = Number(field_height.value)
  updateSize(width, height)
})

field_height.addEventListener('input', (e) => {
  let width = Number(field_width.value)
  let height = Number(field_height.value)
  updateSize(width, height)
})

field_id.addEventListener('input', (e) => {
  let value = Number(field_id.value)
  let selected = annotator.getSelectedTracks()
  if (selected.length == 1) {
    let id = selected[0].id
    // TODO kind of ugly
    // Update annotator.trackIds
    annotator.trackIds[annotator.trackIds.indexOf(id)] = value
    selected[0].id = value
  }
})

field_color.addEventListener('input', (e) => {
  let value = String(field_color.value).substring(1, 8)
  console.log(value)
  console.log(annotator.trackColors)
  annotator.getSelectedTracks().forEach(e => {
    annotator.trackColors[e.id] = value
  })
})

document.getElementById('btn_revert_tracks').addEventListener('click', (e) => {
  annotator.getSelectedTracks().forEach(e => {
    annotator.revertTrack(e)
  })
})

document.getElementById('btn_restore_tracks').addEventListener('click', (e) => {
  let trackIds = annotator.tracks.map(e => {
    return e.id
  })
  let oldTrackIds = annotator.csvData.map(e => e[1].id).filter((e, index, arr) => arr.indexOf(e) === index)
  oldTrackIds = oldTrackIds.filter(e => {
    return !(trackIds.includes(e))
  }).forEach(e => {
    annotator.restoreTrack(e)
  })
})

document.getElementById('btn_fps_change').addEventListener('click', (e) => {
  let fps = Number(document.getElementById('field_fps').value)
  if (fps == annotator.FRAMERATE || fps == 0) {
    return
  } else {
    annotator.FRAMERATE = fps
    annotator.frameCount = Math.round(annotator.video.duration * annotator.FRAMERATE)
    console.log(annotator.frameCount)
    document.getElementById("range_scroll").max = annotator.frameCount - 1
  }
})

canvas.addEventListener('click', function (event) {
  event.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const box = annotator.getBoxAtXY(x, y)
  // Give ctrl priority
  if (event.ctrlKey) {
    annotator.addBox(x, y)
  } else {
    if (!event.shiftKey) {
      annotator.clearSelection()
    }
    if (box) {
      box.track.selected = !box.track.selected
    }
  }

  updateUi()
  updateText()

  // TODO Moving box?
  annotator.redrawCanvas()
})

canvas.addEventListener('contextmenu', function(event) {
  event.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  let selectedBoxes = annotator.getSelectedBoxes()
  if (selectedBoxes.length == 1) {
    // Move box
    annotator.moveBox(selectedBoxes[0], x, y)
  }
})

canvas.addEventListener('mousemove', function(event) {
  mouseX = event.offsetX;
  mouseY = event.offsetY;
})
