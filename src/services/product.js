'use strict';

const {Product, ProductReview } = require('../../database/index').models;

module.exports = {
    batchInsert,
    batchUpdateProduct,
    getProductByAliID,
    getProductAndReviews,
    insertProductReviewsAndImages,
};

async function batchInsert (trx, data, model) {
    try {
        return await model
            .query(trx)
            .insertGraph(data);
    } catch(err) {
        console.log(err.message);
        process.exit(-1);
    }
}

async function getProductByAliID (id, model) {
    return await model
        .query()
        .findOne({ ali_id: id });
}

async function getProductAndReviews (whereStatement) {
    return await Product
        .query()
        .select('products.id', 'product_reviews.id as review_id')
        .leftJoinRelation('product_reviews', 'products.id', 'product_reviews.product_id')
        .findOne(whereStatement);
}

async function insertProductReviewsAndImages (data) {
    return await ProductReview
        .query()
        .insertGraph(data);
}

async function batchUpdateProduct (data) {

    let updatedRows = 0;
    for (let {is_top, where} of data) {
        updatedRows += await Product
            .query()
            .patch({ is_top })
            .where(where);
    }
    return updatedRows;
}
