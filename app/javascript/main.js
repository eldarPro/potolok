// const canvas = document.getElementById('canvas')
// canvas.height = window.innerHeight
// canvas.width = window.innerWidth

// const ctx = canvas.getContext('2d')

// let startX = null
// let startY = null

// ctx.lineWidth = 3

// let draw = false

// function setCircle(x, y, side) {

//     if(side === 'top')  y = y - 10
//     if(side === 'bottom')  y = y + 10

//     ctx.beginPath();                        
//     ctx.arc(x, y, 10, 0, Math.PI*2); 
//     ctx.stroke()
// }


// // Set draw to true when mouse is pressed
// window.addEventListener("mousedown", function(e) {  
//     draw = true

//     startX = e.clientX
//     startY = e.clientY

//     setCircle(startX, startY, 'top')                                             
// })
// // Set draw to false when mouse is released
// window.addEventListener("mouseup", function(e) { 
//   draw = false

//   startY = e.clientY

//   setCircle(startX, startY, 'bottom') 
// })

// window.addEventListener("mousemove", (e) => {
//     // initially previous mouse positions are null
//     // so we can't draw a line
//     if(!draw){
//         return
//     } 

//     let currentY = e.clientY
//     // Drawing a line from the previous mouse position to the current mouse position
//     ctx.beginPath()
//     ctx.moveTo(startX, startY)
//     ctx.lineTo(startX, currentY)
//     ctx.stroke()

// })

//////////////////////////////////////////////////////////

const canvas = document.getElementById('canvas')
canvas.height = window.innerHeight
canvas.width = window.innerWidth

const ctx = canvas.getContext('2d')

ctx.lineWidth = 3

let zoom = 1

// function draw() {
//     console.log(111)
//     requestAnimationFrame( draw )
// }

class Part {

    constructor(direction, distance) {
        this.direction = direction
        this.distance = distance
    }

}

class Room {

    constructor(ctx) {
        this.ctx = ctx
        this.parts = []
    }

    setPart(part) {
        this.setPart(part)
    }

    setPart(part) {

        let moveTo = { X: 70, Y: 50 }

        if(this.parts.length) {
            const lastPart = this.parts[this.parts.length - 1]
            moveTo = lastPart.lineTo
        }


        if(part.direction === 'right') {
            part.lineTo = { X: moveTo.X + part.distance, Y: moveTo.Y }
        }

        if(part.direction === 'bottom') {
            part.lineTo = { X: moveTo.X, Y: moveTo.Y + part.distance }
        }

        if(part.direction === 'left') {
            part.lineTo = { X: moveTo.X - part.distance, Y: moveTo.Y }
        }

        if(part.direction === 'top') {
            part.lineTo = { X: moveTo.X, Y: moveTo.Y - part.distance }
        }

        this.parts.push(part)

        console.log(moveTo, part.lineTo, part.direction, part.distance)

        this.ctx.beginPath()
        this.ctx.moveTo(moveTo.X, moveTo.Y)
        this.ctx.lineTo(part.lineTo.X, part.lineTo.Y)
        this.ctx.stroke()
    }

    redraw() {
        console.log('zoom')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.scale(zoom, zoom)
        this.parts.forEach(i => this.setPart(i))
    }

}

const partsPattern = document.querySelectorAll('#directionBlock span')


partsPattern.forEach((item) => {
    item.addEventListener('click', function() {
        partsPattern.forEach((i) => i.classList.remove('active'))
        item.classList.add('active')
    });
});

const addPartButt = document.getElementById('addPartButt')

const room = new Room(ctx)

const distance = document.getElementById('distance')

addPartButt.addEventListener("click", function(e) {

    const directEl = document.querySelector('#directionBlock .active')
    const distanceEl = document.getElementById('distance')
    

    if(!directEl) { 
        alert("Выберите сторону!")
        return false
    }

    if(!distanceEl.value) { 
        alert("Введите расстояние!")
        return false
    }


    const distance = parseInt(distanceEl.value) * 30
    const selectDirection = directEl.dataset.direction

    const newPart = new Part(selectDirection, distance)
    room.setPart(newPart)

    distanceEl.value = ''
    directEl.classList.remove('active')
})


// canvas.addEventListener( 'wheel', (e) => { 
//     // adjustZoom(e.deltaY*SCROLL_SENSITIVITY)
//     zoom -= 0.1
//     room.redraw()
// })


