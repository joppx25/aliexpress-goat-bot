'use strict';

const { Category } = require('../../database').models;


module.exports = {
    getCategory,
    insertCategory,
};

async function getCategory (whereStatement) {

    try {
        return await Category
            .query()
            .findOne(whereStatement);
    } catch (err) {
        throw new Error(err);
    }
}

async function insertCategory ( name) {

    try {
        return await Category
            .query()
            .insert({ parent_id: null, name: name });
    } catch (err) {
        throw new Error(err);
    }
}
