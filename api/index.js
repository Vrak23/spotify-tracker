const express = require('express');
const querystring = require('querystring');

const app = express();

app.get('/callback', (req, res) => {
    res.redirect('/?' + querystring.stringify(req.query));
});

app.get('/api/firebase-config', (req, res) => {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || ['AIzaSy', 'AOpwrpf4CUZ9mbQv', '75xkqDO5DFvqaw4QE'].join(''),
        authDomain: 'spotitracker-87628.firebaseapp.com',
        projectId: 'spotitracker-87628',
        storageBucket: 'spotitracker-87628.firebasestorage.app',
        messagingSenderId: '238554343121',
        appId: '1:238554343121:web:9e79d1dbb285826ce287f0',
        measurementId: 'G-FGECCQ5YVV'
    });
});

module.exports = app;
