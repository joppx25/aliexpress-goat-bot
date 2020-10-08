'use strict';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3306;

const config = {
    host    : process.env.DB_HOST || DEFAULT_HOST,
    port    : process.env.DB_PORT || DEFAULT_PORT,
    user    : process.env.DB_USER,
    password: process.env.DB_PWD,
    database: process.env.DB_NAME
};

module.exports = Object.freeze(config);
