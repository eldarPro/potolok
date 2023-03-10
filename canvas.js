const canvas = document.getElementById('canvas')
canvas.width = window.innerWidth
canvas.height = 548

const ctx = canvas.getContext('2d')
ctx.lineWidth = 3

const joinLineButt = document.getElementById('join_line_butt')

let canvasWidth = canvas.width // Canvas wide
let canvasHeight = canvas.height // High canvas
let cssWidth = canvas.width // CSS settings
let cssHeight = canvas.height // CSS high
let scale = 1 // Current zoom
let preScale = 1
let mousePos = { x: 0, y: 0 } // Позиция мышки X и Y относительно canvas
let offset = { x: 0, y: 0 }
let curOffset = { x: 0, y: 0 }
let maxScale = 12 // Zoom maximum multiple (zoom ratio multiple)
let minScale = 0.13 // Zoom minimum multiple (scale of zoom ratio)
let scaleStep = 0.2 // Zoom ratio

const MAX_DISTANCE = 3000

let polygon_stage = true

// Judgment whether the mobile terminal, the mobile terminal uses a touch event
const isTouchPad = /hp-tablet/gi.test(navigator.appVersion);
const hasTouch   = "ontouchstart" in window && !isTouchPad;
const touchStart = hasTouch ? "touchstart" : "mousedown";
const touchMove  = hasTouch ? "touchmove" : "mousemove";
const touchEnd   = hasTouch ? "touchend" : "mouseup";

const parts = []

const marks = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

function setPart(direction, distance) {
  part = setPartData(direction, distance)
  parts.push(part)
  drawPart(part)
  correctionVisible()
  checkShowJoinLineButt()
}

function setPartData(direction, distance) {
  const mark = setMark()
  const [moveTo, lineTo] = setMoveLine(direction, distance)

  return {
    mark: mark,
    direction: direction,
    distance: distance,
    moveTo: moveTo,
    lineTo: lineTo
  }
}

function correctionVisible(){
  let maxWidthX = 0
  let minWidthX = 500

  let maxWidthY = 0
  let minWidthY = 500

  parts.forEach(part => {
    if(part.lineTo.x > maxWidthX) maxWidthX = part.lineTo.x
    if(part.moveTo.x > maxWidthX) maxWidthX = part.moveTo.x  

    if(part.lineTo.x < minWidthX) minWidthX = part.lineTo.x
    if(part.moveTo.x < minWidthX) minWidthX = part.moveTo.x 

    if(part.lineTo.y > maxWidthY) maxWidthY = part.lineTo.y
    if(part.moveTo.y > maxWidthY) maxWidthY = part.moveTo.y

    if(part.lineTo.y < minWidthY) minWidthY = part.lineTo.y
    if(part.moveTo.y < minWidthY) minWidthY = part.moveTo.y 
  })

  maxPolygonWidth = maxWidthX - minWidthX
  maxPolygonheight = maxWidthY - minWidthY

  normalWidth = canvasWidth - 40
  normalHeight = canvasHeight - 40

  if(maxPolygonWidth >= normalWidth) {
    while (true) {
      res = maxPolygonWidth * scale
      if(normalWidth >= res) break;
      scale -= 0.01
    }
    maxPolygonWidth *= scale
    maxPolygonheight *= scale
    preScale = scale
  }

  if(maxPolygonheight >= normalHeight) {
    while (true) {
      res = maxPolygonheight * scale
      if(normalHeight >= res) break;
      scale -= 0.01
    }
    maxPolygonWidth *= scale
    maxPolygonheight *= scale
    preScale = scale
  }

  trX = (canvasWidth / 2) - (maxPolygonWidth / 2)
  trY = (canvasHeight / 2) - (maxPolygonheight / 2)

  offset = { x: trX, y: trY }
  curOffset = { x: trX, y: trY }
  reDraw()
}

function setMark() {
  let start, end;

  if(parts.length) {
    const lastPart = parts[parts.length - 1]
    start = lastPart.mark.end
    end = marks[parts.length + 1]
  } else {
    start = marks[0]
    end = marks[1]
  }

  return { start, end }
}

function setMoveLine(direction, distance) {
  let moveTo, lineTo;
  
  // Если первая линия
  if(!parts.length) {
    moveTo = { x: 0 , y: 0 }
  } else {
    const lastPart = parts[parts.length - 1]
    moveTo = lastPart.lineTo
  }

  if(direction === 'right') lineTo = { x: moveTo.x + distance, y: moveTo.y }
  if(direction === 'bottom') lineTo = { x: moveTo.x, y: moveTo.y + distance }
  if(direction === 'left') lineTo = { x: moveTo.x - distance, y: moveTo.y }
  if(direction === 'top') lineTo = { x: moveTo.x, y: moveTo.y - distance }

  return [moveTo, lineTo]
}

function drawPart(part) {
  drawMark(part)
  drawElement(part)
}

function isFirstPart(part){
  return !parts.length || JSON.stringify(parts[0]) === JSON.stringify(part)
}

function drawMark(part) {
  ctx.font = "normal 16px sans-serif";
  ctx.textAlign = "center";
  
  // Если первая линия, то добавляет в начале букву
  if(isFirstPart(part)) {

    const startPointX = part.moveTo.x 
    const startPointY = part.moveTo.y - 10
    
    ctx.fillText(part.mark.start, startPointX, startPointY);
  }

  let endPointX, endPointY = 0;

  if(part.direction == 'right') {
    endPointX = part.lineTo.x 
    endPointY = part.lineTo.y - 10
  }

  if(part.direction == 'bottom') {
    endPointX = part.lineTo.x 
    endPointY = part.lineTo.y + 20
  }

  if(part.direction == 'left') {
    endPointX = part.lineTo.x 
    endPointY = part.lineTo.y + 20
  }

  if(part.direction == 'top') {
    endPointX = part.lineTo.x 
    endPointY = part.lineTo.y - 10
  }

  if(part.mark.end) {
    ctx.fillText(part.mark.end, endPointX, endPointY);
  }
}

function drawElement(part) {
  ctx.beginPath()
  ctx.lineWidth = 1
  ctx.moveTo(part.moveTo.x, part.moveTo.y)
  ctx.lineTo(part.lineTo.x, part.lineTo.y)
  ctx.stroke()
}


function zoomIn() {
  scale += scaleStep;
  if (scale > maxScale) {
    scale = maxScale;
    return;
  }
  zoom();
}

function zoomOut() {
  scale -= scaleStep;
  console.log(1)
  if (scale < minScale) {
    scale = minScale;
    return;
  }
  console.log(scale)
  zoom();
}

function zoom() {
  offset.x = mousePos.x - ((mousePos.x - offset.x) * scale) / preScale
  offset.y = mousePos.y - ((mousePos.y - offset.y) * scale) / preScale
  reDraw()
  preScale = scale
  curOffset.x = offset.x
  curOffset.y = offset.y
}

function addDragEvent() {
  canvas.addEventListener(touchStart, dragStart);
  let x = 0;
  let y = 0;

  function dragMove(e) {
    offset.x = curOffset.x + (e.x - x)
    offset.y = curOffset.y + (e.y - y)
    console.log('dragMove', offset)
    reDraw();
  }
  function dragEnd() {
    curOffset.x = offset.x;
    curOffset.y = offset.y;
    console.log('dragEnd', curOffset)
    window.removeEventListener(touchMove, dragMove);
    window.removeEventListener(touchEnd, dragEnd);
  }

  function dragStart(e) {
    x = e.x;
    y = e.y;
    console.log('dragStart', e.x, e.y)
    window.addEventListener(touchMove, dragMove);
    window.addEventListener(touchEnd, dragEnd);
  }
}

addDragEvent()

function clearCanvas() {
  // Сброс размера холста приведет к очистке карты и сбросу встроенного масштаба холста и т.д.
  canvas.width = canvasWidth
}

// Перерисовка
function reDraw() {
  clearCanvas();
  ctx.translate(offset.x, offset.y);
  ctx.scale(scale, scale);
  parts.forEach(part => drawPart(part))
}

// Проверяет нужно ли показывать кнопку соединения линий
function checkShowJoinLineButt() {
  firstPart = parts[0]
  lastPart  = parts[parts.length - 1]

  leftPoint   = firstPart.moveTo.x - 20
  rightPoint  = firstPart.moveTo.x + 20
  topPoint    = firstPart.moveTo.y - 20
  bottomPoint = firstPart.moveTo.y + 20

  if(lastPart.lineTo.x >= leftPoint && lastPart.lineTo.x <= rightPoint
    && lastPart.lineTo.y >= topPoint && lastPart.lineTo.y <= bottomPoint) {
    joinLineButt.classList.remove('display_none')
  } else {
    joinLineButt.classList.add('display_none')
  }
}

const partsPattern = document.querySelectorAll('#directionBlock span')

partsPattern.forEach((item) => {
  item.addEventListener('click', function() {
    partsPattern.forEach((i) => i.classList.remove('active'))
    item.classList.add('active')
  });
});

canvas.addEventListener('mousewheel', function(e) {
  mousePos.x = e.offsetX;
  mousePos.y = e.offsetY;

  let b = true;
  if(e.wheelDelta) {
    b = e.wheelDelta > 0;
  } else {
    b = e.detail < 0;
  }

  if(b) {
    zoomIn();
  } else {
    zoomOut();
  }

  if(e.preventDefault) e.preventDefault();
  
  return false;
});


joinLineButt.addEventListener("click", function(e) {
  const firstPart = parts[0]
  const lastPart = parts[parts.length - 1]
  lastPart.lineTo.y = firstPart.lineTo.y
  lastPart.mark.end = null
  firstPart.moveTo.x = lastPart.lineTo.x
  reDraw()

  $(this).classList.add('display_none')
  $('.add_line_block').classList.add('display_none')
})
