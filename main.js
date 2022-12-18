if (!('indexedDB' in window)) {
  console.log("This browser doesn't support IndexedDB");
}

const dbPromise = idb.openDb('potolokDB', 1, function (upgradeDb) {
  if (!upgradeDb.objectStoreNames.contains('projects')) {
    const projects = upgradeDb.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
  }
  if (!upgradeDb.objectStoreNames.contains('rooms')) {
    const rooms = upgradeDb.createObjectStore('rooms', { keyPath: 'id', autoIncrement: true });
    rooms.createIndex('project_id', 'project_id');
  }
  if (!upgradeDb.objectStoreNames.contains('contours')) { 
    const rooms = upgradeDb.createObjectStore('contours', { keyPath: 'id', autoIncrement: true });
  }
  if (!upgradeDb.objectStoreNames.contains('profile')) { 
    const profile = upgradeDb.createObjectStore('profile', { keyPath: 'id', autoIncrement: true });
    profile.add({ 
      lastname: 'test',
      name: 'test',
      patronymic: 'test',
      company: 'test',
    })
  }
})

async function getDataAll(name) {
  return await dbPromise.then(function (db) {
    const tx = db.transaction(name);
    const store = tx.objectStore(name);
    return store.getAll()
  })
} 

async function setDbData(name, item) {
  return await dbPromise.then(function (db) {
    const tx = db.transaction(name, 'readwrite');
    const store = tx.objectStore(name);
    item['created_at'] = new Date()
    store.put(item)
    return tx.complete
  });
}


var app = new Framework7({
  el: '#app',
  name: 'Potolok',
  id: 'com.myapp.test',
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
      path: '/projects/rooms/new',
      componentUrl: './pages/new_room.html',
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
      path: '/price_lists/contours/new',
      componentUrl: './pages/new_countour.html',
    },
    {
      path: '/profile/',
      componentUrl: './pages/profile.html',
    },
    {
      path: '/profile/edit',
      componentUrl: './pages/edit_profile.html',
    },


  ],
});

var $$ = Dom7;       

var mainView = app.views.create('.view-main', { 
  url: '/'
})
var priceListView = app.views.create('.view-price-lists', { url: '/price_lists/' })
var profileView = app.views.create('.view-profile', { url: '/profile/' })


