// app.js
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');
var fs = require('fs/promises');

require('dotenv').config();

var app = express();
const PORT = process.env.PORT || 8080;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let dbPool;

(async () => {
  let connectionForSetup;
  try {
    const tempPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
        multipleStatements: true
    });
    connectionForSetup = await tempPool.getConnection();
    console.log('Connected to MySQL server for database setup.');

    const sqlFilePath = path.join(__dirname, 'dogwalks.sql');
    const sqlScript = await fs.readFile(sqlFilePath, 'utf-8');

    const statements = sqlScript.split(';\n').map((stmt) => stmt.trim()).filter((stmt) => stmt.length > 0);
    for (const statement of statements) {
        if (statement.startsWith('--') || statement.startsWith('/*')) {
            continue;
        }
        try {
            await connectionForSetup.query(statement);
        } catch (err) {
            if (err.code === 'ER_DB_CREATE_EXISTS' || err.code === 'ER_TABLE_EXISTS_ERROR') {
                console.warn('Setup warning');
            } else if (err.code === 'ER_DUP_ENTRY' && statement.toUpperCase().startsWith('INSERT')) {
                console.warn('Duplicate entry skipped');
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
      password: process.env.DB_PASSWORD || '',
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
        throw new Error("database pool is not initialized yet.");
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
        console.error("error fetching dogs:", error);
        res.status(500).json({ error: "failed to retrieve dogs", details: error.message });
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
        console.error("error fetching open walk requests:", error);
        res.status(500).json({ error: "failed to retrieve open walk requests", details: error.message });
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
        console.error("error fetching walkers summary:", error);
        res.status(500).json({ error: "failed to retrieve walkers summary", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});
