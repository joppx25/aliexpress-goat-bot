'use strict';
const { raw }      = require('objection');
const { Category } = require('../../database').models;
const LIMIT  = 1000;

module.exports = {
    getCategory,
    insertCategory,
    batchInsert,
    getAllProducts,
    getAllProductsDontHaveType,
    getAllTypes,
    getProduct,
    batchUpsert,
    getAllUniqueProductParentSKU,
    updateData,
    getAllProductsBySKU,
    getProductBySKU,
    getImagesById,
    deleteImageByProductId,
    getProductsAndCategory,
    getGoatProductsByParentSKU,
};

async function getCategory (whereStatement) {

    return await Category
        .query()
        .findOne(whereStatement);
}

async function insertCategory (name) {

    return await Category
        .query()
        .insert({ parent_id: null, name: name });
}

async function batchInsert (data, model) {

    try {
        return await model
            .query()
            .insertGraph(data);
    } catch (err) {
        console.log(err);
        process.exit(-1);
    }
}

async function batchUpsert (data, model) {

    return await model
        .query()
        .upsertGraph(data, {insertMissing: true});
}

async function getAllProducts (model, columns, offset, limit) {
    const arrayLimit = limit ? limit : LIMIT;

    return await model
        .query()
        .select(columns)
        .offset(offset)
        .limit(arrayLimit);
}

async function getAllProductsDontHaveType (model, columns, offset, limit) {
    const arrayLimit = limit ? limit : LIMIT;

    return await model
        .query()
        .select(columns)
        .where({product_type: null})
        .orWhere({product_type: ''})
        .offset(offset)
        .limit(arrayLimit);
}

async function getAllTypes (model, columns = '*') {

    return await model
        .query()
        .select(columns);
}

async function getProduct (condition, columns, model) {

    return await model
        .query()
        .select(columns)
        .findOne(condition);
}

async function getAllUniqueProductParentSKU (model) {

    return await model
        .query()
        .whereNotIn('parent_sku', ['purple','gray','yellow','max','green', 'colorfull','black', 'white', 'grey', 'red', 'blue'])
        .andWhere({product_type: 1}) // 1 is shoes
        .select(raw(`DISTINCT parent_sku`));
}

async function updateData (data, where, model) {

    return await model
        .query()
        .update(data)
        .where(where);
}

async function getAllProductsBySKU (model, where = true) {

    return await model
        .query()
        .select(['sku', 'ali_id', 'id'])
        .where(where);
}

async function getGoatProductsByParentSKU (model, where = true) {

    return await model
        .query()
        .select(['parent_sku', 'id'])
        .where(where);
}

async function getProductBySKU (sku, model) {

    return await model
        .query()
        .findOne({sku});
}

async function getImagesById (condition, model) {

    return await model
        .query()
        .where(condition);
}

async function deleteImageByProductId (condition, model) {

    return await model
        .query()
        .delete()
        .where(condition);
}

async function getProductsAndCategory (model, relatedModel, columns, offset, limit) {

    return await model
        .query()
        .select(columns)
        .innerJoin(relatedModel, `${model.tableName}.category_id`, `${relatedModel}.id`)
        .offset(offset)
        .limit(limit);
}
