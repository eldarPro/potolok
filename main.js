var app = new Framework7({
  el: '#app',
  name: 'Potolok',
  id: 'com.myapp.test',
  pushState: true,
  smartSelect: {
    sheetCloseLinkText: 'Готово',
    closeOnSelect: true
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
      path: '/rooms/:id/contours',
      componentUrl: './pages/room_contours.html',
    },
    {
      path: '/rooms/:id/services',
      componentUrl: './pages/room_services.html',
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
      path: '/price_lists/cloths',
      componentUrl: './pages/cloths.html',
    },
    {
      path: '/price_lists/cloths/:id/edit',
      componentUrl: './pages/new_cloth.html',
    },
    {
      path: '/price_lists/cloths/new',
      componentUrl: './pages/new_cloth.html',
    },
    {
      path: '/price_lists/lusters',
      componentUrl: './pages/lusters.html',
    },
    {
      path: '/price_lists/lusters/:id/edit',
      componentUrl: './pages/new_luster.html',
    },
    {
      path: '/price_lists/lusters/new',
      componentUrl: './pages/new_luster.html',
    },
    {
      path: '/price_lists/services',
      componentUrl: './pages/services.html',
    },
    {
      path: '/price_lists/services/:id/edit',
      componentUrl: './pages/new_service.html',
    },
    {
      path: '/price_lists/services/new',
      componentUrl: './pages/new_service.html',
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

const toast = (title, success = false, position = 'center') => {

  const cssClass = success ? 'success_toast' : 'bg-color-red'

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
  if(!item.data) return res

  item.data.forEach(i => {
    if(i.type === 'contour' && i.finish) {
      res = true
      return
    }
  })

  return res
}

const сalcLinearMtrs = (data) => {
  let res = 0
  data.forEach(i => res += i.distance)
  return res / 100
}

const сalcSquareMtrs = (data) => {
  console.log('Start: сalcSquareMtrs')

  let maxWidthX = 0
  let minWidthX = 500

  let maxWidthY = 0
  let minWidthY = 500

  data.forEach(part => {
    if(part.lineTo.x > maxWidthX) maxWidthX = part.lineTo.x
    if(part.moveTo.x > maxWidthX) maxWidthX = part.moveTo.x  

    if(part.lineTo.x < minWidthX) minWidthX = part.lineTo.x
    if(part.moveTo.x < minWidthX) minWidthX = part.moveTo.x 

    if(part.lineTo.y > maxWidthY) maxWidthY = part.lineTo.y
    if(part.moveTo.y > maxWidthY) maxWidthY = part.moveTo.y

    if(part.lineTo.y < minWidthY) minWidthY = part.lineTo.y
    if(part.moveTo.y < minWidthY) minWidthY = part.moveTo.y 
  })

  // Максимальная и минимальные длины и высоты чертежа
  const minX = Math.min(minWidthX, maxWidthX)
  const minY = Math.min(minWidthY, maxWidthY)

  const maxX = Math.max(minWidthX, maxWidthX)
  const maxY = Math.max(minWidthY, maxWidthY)

  console.log('minX - maxX:', minX, maxX)
  console.log('minY - maxY:', minY, maxY)

  // Расчет общего кв.м. чертежа
  const realSum = ((minX + maxX) / 100) * ((minX + maxX) / 100)

  let listSquares = []

  let a = 0

  console.log('data', data)

  // Цикл сверху-вниз
  for (let i = minY; i <= maxY; i++) {

    let findContour = false

    // Цикл слева-направо
    for (let n = minX; n <= maxX; n++) {        

      data.forEach((part, inx) => {

        if(((part.direction === 'bottom' || part.direction === 'top') && (part.moveTo.y >= i && part.lineTo.y <= i || part.moveTo.y <= i && part.lineTo.y >= i) && (part.moveTo.x === n || part.lineTo.x === n)) || 
          ((part.direction === 'right' || part.direction === 'left') && part.moveTo.y === i && part.lineTo.y === i && (part.moveTo.x === n || part.lineTo.x === n))) {
          
          if(findContour) {
            console.log('add a:', a)
            findContour = false
            listSquares.push(a)
          } else {
            findContour = true
            a = 0
          }
        }

      }) 

      a++
    }

  }


  let res = 0

  listSquares.forEach(i => res += (i / 10000))

  res = res.toFixed()

  console.log('realSum', realSum)
  console.log('res squares', res)
  
  return res
}

const priceRoom = (item, priceLists, install = false) => {
  let res = 0
  if(!item.data || !isFinishRoom(item)) return res

  let contours = []
  let lusters  = [] 
  let services = []

  item.data.forEach(i => {
    if(i.type === 'contour') contours.push(i)
    if(i.type === 'luster')  lusters.push(i)
    if(i.type === 'service') services.push(i)
  })

  let cloth

  // Полотно
  if(priceLists.cloths.length) {
    cloth = priceLists.cloths.find(c => c.id == item.cloth_id)
  }

  if(cloth) {
    price = install ? cloth.price_install : cloth.price
    res += item.square_mtrs * price

    price = install ? cloth.price_install_corner : cloth.price_corner
    if(contours.length) res += contours.length * price
  }

  // Профили
  if(priceLists.contours.length) {
    contours.forEach((i, inx) => {
      const findContour = priceLists.contours.find(c => c.id == i.contour_id)
      if(!findContour) return

      price = install ? findContour.price_install : findContour.price

      res += (i.distance / 100) * price

      let prevContour

      if(i.num == 0) prevContour = contours[contours.length - 1]
      else prevContour = contours[inx - 1]
    
      if(prevContour) prevContour = priceLists.contours.find(c => c.id == prevContour.contour_id)

      let nextContour = contours[inx + 1]
      if(nextContour) nextContour = priceLists.contours.find(c => c.id == nextContour.contour_id)
  
      if(install) {
        prevContourPriceCorner = prevContour.price_install_corner
        findContourPriceCorner = findContour.price_install_corner
      } else {
        prevContourPriceCorner = prevContour.price_corner
        findContourPriceCorner = findContour.price_corner
      }

      if(prevContour && prevContourPriceCorner > findContourPriceCorner) {
        res += prevContourPriceCorner
      } else {
        res += findContourPriceCorner
      }

      return
    })
  }

  // Люстры
  if(priceLists.luster && lusters.length) {
    price = install ? priceLists.luster.price_install : priceLists.luster.price
    res += lusters.length * price
  }

  // Дополнительные услуги
  // Профили
  if(priceLists.services.length) {
    services.forEach((i, inx) => {
      const findService = priceLists.services.find(c => c.id == i.service_id)
      if(!findService) return
      price = install ? findService.price_install : findService.price
      res += price
    })
  }

  return res.toFixed()
}

const priceRoomInstall = (item) => {
  let res = 0
  if(item.data && !isFinishRoom(item)) {
   // item.data.contours.forEach(i => res += i.distance)
  }
  return res / 100
}

//var host = 'http://127.0.0.1:3000'
var host = 'https://potolokapi-production-2237.up.railway.app'


$$(document).on('page:init', function (e) {
  // Получаем текущую страницу
  const currentPage = app.views.main.router.currentRoute.url;
  const params = app.views.main.router.currentRoute.params;
  console.log('currentPage', currentPage)
  // Проверяем, является ли текущая страница страницей "about.html"
  if (currentPage === '/rooms/' + params.id + '/process' ||
      currentPage === '/rooms/' + params.id + '/contours' ||
      currentPage === '/rooms/' + params.id + '/services') {
    $$('.main_toolbar').addClass('display-none')
  } else {
    $$('.main_toolbar').removeClass('display-none')
  }
});