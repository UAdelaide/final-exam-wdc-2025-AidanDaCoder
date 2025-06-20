const express = require('express');
const path = require('path');
require('dotenv').config();

// added middleware for parsing cookies from incoming HTTP requests
var cookieParser = require('cookie-parser');
// added log for HTTP requests to the console
var logger = require('morgan');
// added ability to connect to MYSQL using promises
var mysql = require('mysql2/promise');
// added promise file system methods
var fs = require('fs/promises');
// added user session management for login
var session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

// added middleware setup
pp.use(logger('dev')); // for logging HTTP requests
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded (login form)
app.use(cookieParser()); // for parsing cookies

//session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dog', 
    resave: false,
    saveUninitialized: true, // sets to true to store session on first request
    cookie: {
        secure: process.env.NODE_ENV === 'production', // secure cookies in production
        httpOnly: true,
        maxAge: 100000000 // cookie valid for a time of 100 million milliseconds
    }
}));

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;