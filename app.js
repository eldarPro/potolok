const path = require('path');
const express = require('express');
const app = express();
app.use(express.static(path.join(__dirname)))
app.get('/', (req, res) => {
    res.sendFile(`${__dirname}/index.html`);
});

const router = express.Router();
//add the router
app.use('/', router);
app.listen(process.env.port || 3000);