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
  if(item.data && isFinishRoom(item)) {
    item.data.forEach(i => {
      if(Object.values(i)[0].type === 'contour') {
        res += i.contour.distance
      }
    })
  }
  return res / 100
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