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

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;