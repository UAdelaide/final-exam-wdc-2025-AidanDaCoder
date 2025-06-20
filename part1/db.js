import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'test',
    password: process.env.DB_PASSWORD || '123',
    database: process.env.DB_DATABASE || 'DogWalkService',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

async function initialiseDatabase() {
    let connection;
    try {
        const tempPool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            waitForConnections: true,
            connectionLimit: 1,
            queueLimit: 0,
            multipleStatements: true
        });
        connection = await tempPool.getConnection();
        console.log('Connected to MySQL server.');

        const sqlFilePath = path.join(process.cwd(), 'dogwalks.sql');
        const sqlScript = await fs.readFile(sqlFilePath, 'utf-8');

        const statements = sqlScript.split(';\n').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);

        for (const statement of statements) {
            if (statement.startsWith('--') || statement.startsWith('/*')) {
                continue;
            }
            try {
                await connection.query(statement);
            } catch (err) {
                if (err.code === 'ER_DB_CREATE_EXISTS' || err.code === 'ER_TABLE_EXISTS_ERROR') {
                } else if (err.code === 'ER_DUP_ENTRY' && statement.toUpperCase().startsWith('INSERT')) {
                }
            }
        }