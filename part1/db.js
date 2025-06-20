import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'test',
    password: process.env.DB_PASSWORD || '',
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
        console.log('connected to MySQL server.');

        const sqlFilePath = path.join(process.cwd(), 'dogwalks.sql');
        const sqlScript = await fs.readFile(sqlFilePath, 'utf-8');

        const statements = sqlScript.split(';\n').map((stmt) => stmt.trim()).filter((stmt) => stmt.length > 0);

        for (const statement of statements) {
            if (statement.startsWith('--') || statement.startsWith('/*')) {
                continue;
            }
            try {
                await connection.query(statement);
            } catch (err) {
                if (err.code === 'ER_DB_CREATE_EXISTS' || err.code === 'ER_TABLE_EXISTS_ERROR') {
                    console.warn(`warning during setup`);
                } else if (err.code === 'ER_DUP_ENTRY' && statement.toUpperCase().startsWith('INSERT')) {
                    console.warn(`warning duplicate entry skipped for statement`);
                }
                else {
                    console.error(`error executing statement or SQL error`);
                }
            }
        }

        console.log('successfully created database schema');
        await tempPool.end();

    } catch (error) {
        console.error('failed to initialise database:', error);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }

}

async function getConnection() {
    return pool.getConnection();
}

export { pool, initialiseDatabase, getConnection }