var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
import 'dotenv/config';
import { pool, initializeDatabase, getConnection } from './db.js';

// var indexRouter = require('./routes/index');
// var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// app.use('/', indexRouter);
// app.use('/users', usersRouter);

// api/dogs
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

// api/walkrequests/open
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
            average_rating: walker.total_ratings > 0
            ? parseFloat(parseFloat(walker.average_rating).toFixed(2)) : null
        }));
        res.json(formattedResults);
    } catch (error)
    {
        console.error("error fetching walkers summary:", error);
        res.status(500).json({ error: "failed to retrieve walkers summary", details: error.message });
    } finally {
        if (connection) connection.release();
    }
});

async function startServer() {
    try {
        await initializeDatabase(); // Initialize and seed the database
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log('Available routes:');
            console.log(`  GET http://localhost:${PORT}/api/dogs`);
            console.log(`  GET http://localhost:${PORT}/api/walkrequests/open`);
            console.log(`  GET http://localhost:${PORT}/api/walkers/summary`);
        });
    } catch (error) {
        console.error("Could not start server:", error);
        process.exit(1); // Exit if server can't start due to DB issues
    }
}

startServer();

module.exports = app;
