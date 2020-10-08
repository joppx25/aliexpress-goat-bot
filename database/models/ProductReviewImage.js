'use strict';

const BaseModel = require('./BaseModel');
const { BelongsToOneRelation } = require('objection');
const ProductReview = require('./ProductReview');

module.exports = class ProductReviewImage extends BaseModel {

    /**
     * Return table name
     *
     * @return string
     */
    static get tableName () {
        return 'product_review_images';
    }

    /**
     * Return object relation mapping
     *
     * @return object
     */
    static get relationMappings () {
        return {
            product_reviews: {
                relation: BelongsToOneRelation,
                modelClass: ProductReview,
                join: {
                    from: 'product_review_images.product_review_id',
                    to  : 'product_reviews.id',
                }
            }
        };
    }

    /**
     * Addig timestamp on every insert or modification of the item in table
     *
     * @return bool
     */
    static get timestamps () {
        return true;
    }
}
