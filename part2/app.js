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
app.use(logger('dev')); // for logging HTTP requests
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded (login form)
app.use(cookieParser()); // for parsing cookies

//session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dog',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // secure cookies in production
        httpOnly: true,
        maxAge: 100000000 // cookie valid for a time of 100 million milliseconds
    }
}));

// database connection pool
let dbPool; // declared globally within this module

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
        throw new Error("Database pool not initialized. Call initialiseDatabaseAndPool first.");
    }
    return dbPool.getConnection();
}

// Routes
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

// route to serve login page or redirect to corresponding dashboard
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'owner') {
            return res.redirect('/owner-dashboard');
        }
        if (req.session.user.role === 'walker') {
            return res.redirect('/walker-dashboard');
        }
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// login POST route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect('/?error=' + encodeURIComponent('Username and password are required.'));
    }

    let connection;
    try {
        connection = await getDbConnection();
        const [users] = await connection.query('SELECT * FROM Users WHERE username = ?', [username]);

        if (users.length > 0) {
            const user = users[0];
            if (password === user.password_hash) {
                req.session.user = {
                    id: user.user_id,
                    username: user.username,
                    role: user.role
                };
                console.log(`User ${user.username} (${user.role}) logged in successfully.`);
                if (user.role === 'owner') {
                    res.redirect('/owner-dashboard');
                } else if (user.role === 'walker') {
                    res.redirect('/walker-dashboard');
                } else {
                    res.redirect('/?error=' + encodeURIComponent('Login successful, but role unknown.'));
                }
            } else {
                console.log(`Failed login attempt for user: ${username} (incorrect password)`);
                res.redirect('/?error=' + encodeURIComponent('Invalid username or password.') + '&username=' + encodeURIComponent(username));
            }
        } else {
            console.log(`Failed login attempt for user: ${username} (user not found)`);
            res.redirect('/?error=' + encodeURIComponent('Invalid username or password.') + '&username=' + encodeURIComponent(username));
        }
    } catch (error) {
        console.error('Login process error:', error);
        res.redirect('/?error=' + encodeURIComponent('An error occurred. Please try again.'));
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Owner Dashboard
app.get('/owner-dashboard', ensureAuthenticated, ensureOwner, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'owner-dashboard.html'));
});

// Walker Dashboard
app.get('/walker-dashboard', ensureAuthenticated, ensureWalker, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'walker-dashboard.html'));
});


// logout route
app.get('/logout', (req, res) => {
    const username = req.session.user ? req.session.user.username : 'User';
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        console.log(`${username} logged out.`);
        res.redirect('/');
    });
});

//question 15, get dogs for the currently logged-in owner
app.get('/api/my-dogs', ensureAuthenticated, ensureOwner, async (req, res) => {
    let connection;
    try {
        const ownerId = req.session.user.id; // gets owner_id from session
        if (!ownerId) {
            return res.status(400).json({ error: "Owner ID not found in session." });
        }

        connection = await getDbConnection();
        const query = `
            SELECT dog_id, name, size
            FROM Dogs
            WHERE owner_id = ?
            ORDER BY name ASC;
        `;
        const [dogs] = await connection.query(query, [ownerId]);
        res.json(dogs);
    } catch (error) {
        console.error("Error fetching owner's dogs:", error);
        res.status(500).json({ error: "Failed to retrieve owner's dogs", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});

//question 16, added a new api endpoint to get current logged-in user's details
app.get('/api/users/me', ensureAuthenticated, async (req, res) => {
    // ensureAuthenticated checks if req.session.user exists or not
    if (req.session.user) {
        res.json({
            id: req.session.user.id,
            username: req.session.user.username,
            role: req.session.user.role
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

//question 17, exact same /api/dogs get as part 1 with minor changes
// /api/dogs
app.get('/api/dogs', async (req, res) => {
    let connection;
    try {
        connection = await getDbConnection(); // changed this from getConnection to getDBConnection to match the part 2 function name
        // added dog id, owner id
        const query = `
            SELECT
                d.dog_id,
                d.name AS dog_name,
                d.size,
                d.owner_id,
                u.username AS owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
            ORDER BY d.dog_id ASC;
        `;
        const [results] = await connection.query(query);
        res.json(results);
    } catch (error) {
        console.error("error fetching dogs:", error);
        res.status(500).json({ error: "failed to retrieve dogs", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// call initialise and then start listening since app.js is now the main entry point
initialiseDatabaseAndPool().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
});

const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// module.exports = app;