var app = new Framework7({
  el: '#app',
  name: 'Potolok',
  id: 'com.myapp.test',
  pushState: true,
  smartSelect: {
    sheetCloseLinkText: 'Готово',
    closeOnSelect: true
  },
  panel: {
    swipe: true,
  },
  routes: [
    {
      path: '/',
      componentUrl: './pages/projects.html',
    },
    {
      path: '/projects/new',
      componentUrl: './pages/new_projects.html',
    },
    {
      path: '/projects/:id',
      componentUrl: './pages/view_project.html',
    },
    {
      path: '/rooms/:id/process',
      componentUrl: './pages/room_process.html',
    },
    {
      path: '/price_lists/',
      componentUrl: './pages/price_lists.html',
    },
    {
      path: '/price_lists/contours',
      componentUrl: './pages/contours.html',
    },
    {
      path: '/price_lists/contours/:id/edit',
      componentUrl: './pages/new_countour.html',
    },
    {
      path: '/price_lists/contours/new',
      componentUrl: './pages/new_countour.html',
    },
    {
      path: '/profile',
      componentUrl: './pages/profile.html',
    },
    {
      path: '/profile/edit',
      componentUrl: './pages/edit_profile.html',
    },
    {
      path: '/rooms/:id',
      componentUrl: './pages/view_room.html',
    },

  ],
});

var $$ = Dom7;       

var mainView = app.views.create('.view-main', { 
  url: '/'
})
var priceListView = app.views.create('.view-price-lists', { url: '/price_lists/' })
var profileView = app.views.create('.view-profile', { url: '/profile/' })


window.addEventListener("keypress", function(e) {
  var key = e.charCode || e.keyCode || 0;     
  if (key == 13) {
    e.preventDefault();
  }
})


const booleanTitle = (bool) => {
  return bool ? 'Да' : 'Нет'
}

const lastRoutePath = (path) => {
  return path.split('/')[path.split('/').length - 1]
}

const toBool = (param) => {
  return param[0] === 'on'
}

const toast = (title, success = false, position = 'top') => {

  const cssClass = success ? 'success_toast' : ''

  app.toast.create({
    text: title,
    position: position,
    closeTimeout: 2000,
    cssClass: cssClass
  }).open();

}

// Определяет завершенное ли помещение
const isFinishRoom = (item) => {
  let res = false
  if(item.data) {
    item.data.forEach(i => {
      const el = Object.values(i)[0]
      if(el.type === 'contour' && el.finish) res = true
    })
  }
  return res
}

const сalcLinearMtrs = (item) => {
  console.log(item)
  let res = 0
  if(item.data && isFinishRoom(item)) {
    item.data.forEach(i => {
      if(Object.values(i)[0].type === 'contour') {
        res += i.contour.distance
      }
    })
  }
  return res / 100
}

const сalcSquareMtrs = (item) => {
  let res = 0
  
  let maxWidthX = 0
  let minWidthX = 500

  let maxWidthY = 0
  let minWidthY = 500

  if(item.data && isFinishRoom(item)) {
    item.data.forEach(i => {
      if(Object.values(i)[0].type === 'contour') {
        part = i.contour
        if(part.lineTo.x > maxWidthX) maxWidthX = part.lineTo.x
        if(part.moveTo.x > maxWidthX) maxWidthX = part.moveTo.x  

        if(part.lineTo.x < minWidthX) minWidthX = part.lineTo.x
        if(part.moveTo.x < minWidthX) minWidthX = part.moveTo.x 

        if(part.lineTo.y > maxWidthY) maxWidthY = part.lineTo.y
        if(part.moveTo.y > maxWidthY) maxWidthY = part.moveTo.y

        if(part.lineTo.y < minWidthY) minWidthY = part.lineTo.y
        if(part.moveTo.y < minWidthY) minWidthY = part.moveTo.y 
      }
    })

    res = minWidthX + ' - ' + maxWidthX + ' : ' +  minWidthY + ' - ' + maxWidthY

    const minX = Math.min(minWidthX, maxWidthX)
    const minY = Math.min(minWidthY, maxWidthY)

    const maxX = Math.max(minWidthX, maxWidthX)
    const maxY = Math.max(minWidthY, maxWidthY)

    ////////////////////////////////////////////////////
    // maxWidthX // 140

    let listSquares = []

    let a = 0
    let b = 0

    for (let i = minY; i < maxY; i++) {

      a = i

      for (let n = minX; n < maxX; n++) {
          
        b = n

        let findContourNum = null

        item.data.forEach(i => {
          if(Object.values(i)[0].type === 'contour') {
            part = i.contour
            if(part.lineTo.x === n && part.moveTo.x === n) {
              listSquares.push(a, b)
              findContourNum = part.num
            }
          }
        })

      }
    }

    ////////////////////////////////////////////////////

    item.data.forEach(i => {
      if(Object.values(i)[0].type === 'contour') {
        part = i.contour

        for (let i = 0; i < maxWidthY; i++) {
          console.log(i);
        }

        // const x = Math.max(part.moveTo.x, part.LineTo.x)
        // const y = Math.max(part.moveTo.y, part.LineTo.y)

        // const a = maxWidthX - x
        // const b = maxWidthY - y

        if(part.lineTo.x > maxWidthX) maxWidthX = part.lineTo.x
        if(part.moveTo.x > maxWidthX) maxWidthX = part.moveTo.x  

      }
    })

  }



  return res
}

const priceRoom = (item) => {
  let res = 0
  if(item.data && isFinishRoom(item)) {
    item.data.forEach(i => {
      if(Object.values(i)[0].type === 'contour') {
        res += i.contour.distance
      }
    })
  }
  return res / 100
}

//var host = 'http://127.0.0.1:3000'
var host = 'https://potolokapi-production.up.railway.app'