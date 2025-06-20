var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
import 'dotenv/config';
import { pool, initializeDatabase, getConnection } from './db.js';

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// app.use('/', indexRouter);
// app.use('/users', usersRouter);

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


module.exports = app;
