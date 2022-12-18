var mainDB;
async function initDb() {
    let db;
  
    let openRequest = indexedDB.open("potolokDB", 1);
  
    openRequest.onupgradeneeded = function() {
      console.log(111)
      db = openRequest.result;
      const projects = db.createObjectStore('projects', { autoIncrement: true });
      // const rooms = db.createObjectStore('rooms', { autoIncrement: true });
      // let index = rooms.createIndex('project_id_idx', 'project_id');
    };
  
    openRequest.onerror = function() {
      console.error("Error", openRequest.error);
    };
  
    openRequest.onsuccess = function() {
      console.log(777)
      db = openRequest.result;
      console.log(db)
    };
    
    mainDB = db
    return;
  }
  
  await initDb()