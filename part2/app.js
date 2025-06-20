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
    cookie: {
        secure: process.env.NODE_ENV === 'production', // secure cookies in production
        httpOnly: true,
        maxAge: 100000000 // cookie valid for a time of 100 million milliseconds
    }
}));

// database connection pool
let dbPool; // declare globally within this module

async function initialiseDatabaseAndPool() {
   try {
        // this part is for running the SQL script to set up the DB
        const tempPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            waitForConnections: true,
            connectionLimit: 1,
            queueLimit: 0,
            multipleStatements: true
        });
        const setupConnection = await tempPool.getConnection();
        console.log('Connected to MySQL server for database setup');
        const sqlFilePath = path.join(__dirname, '..', 'part1', 'dogwalks.sql');
        const sqlScript = await fs.readFile(sqlFilePath, 'utf-8');
        const statements = sqlScript.split(';\n').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
        for (const statement of statements) {
            if (statement.startsWith('--') || statement.startsWith('/*')) continue;
            try { await setupConnection.query(statement); }
            catch (err) {
                if (['ER_DB_CREATE_EXISTS', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY'].includes(err.code)) {
                    console.warn('warning with seeding');
                } else {
                    console.error('error in sql');
                    throw err;
                }
            }
        }
        console.log('database schema and seed data successful');
        await setupConnection.release();
        await tempPool.end();

        // creates the main pool for the application
        dbPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_DATABASE || 'DogWalkService',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        return dbPool;
    } catch (error) {
        console.error('Could not initialise database pool', error);
        process.exit(1); // exits if DB connection fails
    }
}

// helper to get connection
async function getDbConnection() {
    if (!dbPool) {
        throw new Error("Database pool not initialized. Call initializeDatabaseAndPool first.");
    }
    return dbPool.getConnection();
}

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

// middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/?error=' + encodeURIComponent('Please log in to access that page.'));
}

// middleware to check if user is an owner
function ensureOwner(req, res, next) {
    if (req.session.user && req.session.user.role === 'owner') {
        return next();
    }
    res.status(403).send('Forbidden: Owners only.');
}

// middleware to check if user is a walker
function ensureWalker(req, res, next) {
    if (req.session.user && req.session.user.role === 'walker') {
        return next();
    }
    res.status(403).send('Forbidden: Walkers only.');
}

app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'owner') {
            return res.redirect('/owner-dashboard');
        } else {
            return res.redirect('/walker-dashboard');
        }

    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;