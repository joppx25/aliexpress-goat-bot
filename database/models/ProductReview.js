'use strict';

const BaseModel = require('./BaseModel');
const { HasManyRelation, BelongsToOneRelation } = require('objection');
const ProductReviewImage = require('./ProductReviewImage');
const Product = require('./Product');

module.exports = class ProductReview extends BaseModel {

    /**
     * Return table name
     *
     * @return string
     */
    static get tableName () {
        return 'product_reviews';
    }

    /**
     * Return object relation mapping
     *
     * @return object
     */
    static get relationMappings () {
        return {
            products: {
                relation: BelongsToOneRelation,
                modelClass: Product,
                join: {
                    from: 'products.id',
                    to  : 'product_reviews.product_id'
                }
            },
            product_review_images: {
                relation: HasManyRelation,
                modelClass: ProductReviewImage,
                join: {
                    from: 'product_reviews.id',
                    to: 'product_review_images.product_review_id',
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
