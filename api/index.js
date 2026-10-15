const express = require('express');
const querystring = require('querystring');

const app = express();

app.get('/callback', (req, res) => {
    res.redirect('/?' + querystring.stringify(req.query));
});

module.exports = app;

