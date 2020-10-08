'use strict';

const BaseModel           = require('./BaseModel');
const { HasManyRelation, ManyToManyRelation } = require('objection');
const ProductReview       = require('./ProductReview');
const ProductReviewImage  = require('./ProductReviewImage');
const ProductImage        = require('./ProductImage');

module.exports = class Product extends BaseModel {

    /**
     * Return table name
     *
     * @return string
     */
    static get tableName () {
        return 'products';
    }

    /**
     * Return object relation mapping
     *
     * @return object
     */
    static get relationMappings () {
        return {
            product_images: {
                relation  : HasManyRelation,
                modelClass: ProductImage,
                join: {
                    from: 'products.id',
                    to  : 'product_images.product_id'
                }
            },
            product_reviews: {
                relation  : HasManyRelation,
                modelClass: ProductReview,
                join: {
                    from: 'products.id',
                    to  : 'product_reviews.product_id',
                }
            },
            product_review_images: {
                relation  : HasManyRelation,
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
