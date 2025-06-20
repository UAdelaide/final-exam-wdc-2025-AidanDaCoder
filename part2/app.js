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
        console.log('Database schema and seed data for Part 2 applied.');
        await setupConnection.release();
        await tempPool.end();

        // Now create the main pool for the application
        dbPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '', // Your MySQL password
            database: process.env.DB_DATABASE_P2 || 'DogWalkServiceP2', // Use a specific DB for Part 2
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        console.log(`Connected to the ${process.env.DB_DATABASE_P2 || 'DogWalkServiceP2'} database.`);
        return dbPool;
    } catch (error) {
        console.error('FATAL: Could not initialize database pool (Part 2):', error);
        process.exit(1); // Exit if DB connection fails
    }
}

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;