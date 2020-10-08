'use strict';

const objection = require('objection');
const Knex      = require('knex');
const models    = require('./models');

const dbConfig = global.getConfig('database');

// Initialize knex.
const knex = Knex({
    client          : 'mysql',
    useNullAsDefault: true,
    connection      : dbConfig
});

// Give the knex object to objection.
objection.Model.knex(knex);

module.exports = {
    knex,
    models,
};
