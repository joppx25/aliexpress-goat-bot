'use strict';

const { Supplier } = require('../../database').models;

module.exports = {
    getSupplier,
    insertSupplier,
};

async function getSupplier (whereStatement) {

    const q = Supplier
        .query()
        .findOne(whereStatement);

    return q.execute();
}

async function insertSupplier (trx, data) {

    try {
        const insertedRows = await Supplier
            .query(trx)
            .insert(data);

        return insertedRows;

    } catch (err) {
        throw new Error(err);
    }

}
