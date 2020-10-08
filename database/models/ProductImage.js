'use strict';

const BaseModel = require('./BaseModel');
const { BelongsToOneRelation } = require('objection');
const Product = require('./Product');

module.exports = class ProductImage extends BaseModel {

    /**
     * Return table name
     *
     * @return string
     */
    static get tableName () {
        return 'product_images';
    }

    /**
     * Return object relation mapping
     *
     * @return object
     */
    static get relationMappings () {
        return {
            products: {
                relation  : BelongsToOneRelation,
                modelClass: Product,
                join: {
                    from: 'product_images.product_id',
                    to  : 'product.id',
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
