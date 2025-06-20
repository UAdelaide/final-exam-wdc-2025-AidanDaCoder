// app.js
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise'); // Using mysql2/promise for async/await
var fs = require('fs/promises'); // For reading the SQL file

require('dotenv').config(); // Load .env variables

var app = express();
const PORT = process.env.PORT || 3000;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// Static files (if any, though not strictly required by the prompt)
// app.use(express.static(path.join(__dirname, 'public')));

let dbPool; // This will be our connection pool

// Async IIFE for database setup
(async () => {
  let connectionForSetup;
  try {
    // 1. Connect to MySQL server (without specifying a database to create it)
    const tempPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root', // Replace with your default if needed
        password: process.env.DB_PASSWORD || '', // Replace with your default if needed
        waitForConnections: true,
        connectionLimit: 1, // Just need one for setup
        queueLimit: 0,
        multipleStatements: true // Essential for running the .sql file
    });
    connectionForSetup = await tempPool.getConnection();
    console.log('Connected to MySQL server for database setup.');

    // 2. Read the dogwalks.sql file
    const sqlFilePath = path.join(__dirname, 'dogwalks.sql'); // Assumes dogwalks.sql is in the same directory as app.js
    const sqlScript = await fs.readFile(sqlFilePath, 'utf-8');

    // 3. Execute the SQL script (creates database, tables, and inserts data)
    // Splitting the script into individual statements is more robust
    const statements = sqlScript.split(';\n').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
    for (const statement of statements) {
        if (statement.startsWith('--') || statement.startsWith('/*')) {
            continue; // Skip comments
        }
        try {
            await connectionForSetup.query(statement);
            // console.log(`Executed: ${statement.substring(0, 50)}...`);
        } catch (err) {
            // Gracefully handle "database exists", "table exists", or "duplicate entry" errors during setup/seeding
            if (err.code === 'ER_DB_CREATE_EXISTS' || err.code === 'ER_TABLE_EXISTS_ERROR') {
                // console.warn(`Setup warning: ${err.message}`);
            } else if (err.code === 'ER_DUP_ENTRY' && statement.toUpperCase().startsWith('INSERT')) {
                // console.warn(`Seeding warning: Duplicate entry skipped for: ${statement.substring(0, 50)}...`);
            } else {
                console.error('error executing SQL statement.');
                console.error('SQL Error.');
                throw err;
            }
        }
    }
    console.log('database schema created.');
    await tempPool.end();
    connectionForSetup = null;

    dbPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123',
      database: process.env.DB_DATABASE || 'DogWalkService',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log(`connected to the ${process.env.DB_DATABASE || 'DogWalkService'} database.`);

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('Error during database setup or initial connection.', err);
    if (connectionForSetup) await connectionForSetup.release();
    process.exit(1);
  }
})();


async function getConnection() {
    if (!dbPool) {
        throw new Error("Database pool is not initialized yet.");
    }
    return dbPool.getConnection();
}

// /api/dogs
app.get('/api/dogs', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const query = `
            SELECT
                d.name AS dog_name,
                d.size,
                u.username AS owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id;
        `;
        const [results] = await connection.query(query);
        res.json(results);
    } catch (error) {
        console.error("Error fetching dogs:", error);
        res.status(500).json({ error: "Failed to retrieve dogs", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const query = `
            SELECT
                wr.request_id,
                d.name AS dog_name,
                wr.requested_time,
                wr.duration_minutes,
                wr.location,
                u.username AS owner_username
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open';
        `;
        const [results] = await connection.query(query);
        res.json(results);
    } catch (error) {
        console.error("Error fetching open walk requests:", error);
        res.status(500).json({ error: "Failed to retrieve open walk requests", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const query = `
            SELECT
                u.username AS walker_username,
                (
                    SELECT COUNT(DISTINCT wa.request_id)
                    FROM WalkApplications wa
                    JOIN WalkRequests wr_completed ON wa.request_id = wr_completed.request_id
                    WHERE wa.walker_id = u.user_id
                      AND wa.status = 'accepted'
                      AND wr_completed.status = 'completed'
                ) AS completed_walks,
                COUNT(DISTINCT wrate.rating_id) AS total_ratings,
                AVG(wrate.rating) AS average_rating
            FROM Users u
            LEFT JOIN WalkRatings wrate ON u.user_id = wrate.walker_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id, u.username
            ORDER BY u.username;
        `;
        const [results] = await connection.query(query);
        const formattedResults = results.map((walker) => ({
            ...walker,
            completed_walks: Number(walker.completed_walks),
            total_ratings: Number(walker.total_ratings),
            average_rating: walker.total_ratings > 0 ? parseFloat(parseFloat(walker.average_rating).toFixed(2)) : null
        }));
        res.json(formattedResults);
    } catch (error) {
        console.error("Error fetching walkers summary:", error);
        res.status(500).json({ error: "Failed to retrieve walkers summary", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});
