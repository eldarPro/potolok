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
  view: {
    stackPages: true,
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
  url: '/rooms/8/process'
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


// const dbPromise = idb.openDb('potolokDB', 1, function (upgradeDb) {
//   if (!upgradeDb.objectStoreNames.contains('projects')) {
//     const projects = upgradeDb.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
//   }
//   if (!upgradeDb.objectStoreNames.contains('rooms')) {
//     const rooms = upgradeDb.createObjectStore('rooms', { keyPath: 'id', autoIncrement: true });
//     rooms.createIndex('project_id', 'project_id');
//   }
//   if (!upgradeDb.objectStoreNames.contains('contours')) { 
//     const rooms = upgradeDb.createObjectStore('contours', { keyPath: 'id', autoIncrement: true });
//   }
//   if (!upgradeDb.objectStoreNames.contains('profile')) { 
//     const profile = upgradeDb.createObjectStore('profile', { keyPath: 'id', autoIncrement: true });
//     profile.add({ 
//       lastname: 'test',
//       name: 'test',
//       patronymic: 'test',
//       company: 'test',
//     })
//   }
// })


