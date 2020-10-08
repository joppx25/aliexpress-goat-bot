'use strict';

const ProductService = require('./service/ProductService');
const { Product }    = require('../database/index').models;
const common         = require('../helper/common');

module.exports = class ProductSizeConverter {

    constructor (productId, logger) {
        this.productId  = productId;
        this.logger     = logger;
        this.offset     = 0;
        this.limit      = 5000;
    }

    async execute () {
        let result   = [];
        let products = [];

        do {
            products = await ProductService.getProductsAndCategory(Product, 'categories', ['products.id', 'products.size', 'products.gender', 'categories.name'], this.offset, this.limit);
            for (let product of products) {
                let productSizes  = product.size != '' ? JSON.parse(product.size) : [];

                if (productSizes.length) {
                    let distinctSizes = [...new Set(productSizes)];
                    if (product.gender && distinctSizes.length && !common.isShoeSizes(distinctSizes)) {
                        let newSizes = common.convertSize(product.gender, distinctSizes, product.name)
                        if (newSizes.length) {
                            result.push({
                                id: product.id,
                                size: JSON.stringify(newSizes),
                            });
                        }
                    }
                }
            }

            if (result.length) {
                this.logger.info(`Updating No. of products ${result.length}`);
                await ProductService.batchUpsert(result, Product);
                result = [];
            }

            this.offset += this.limit;
        } while (products.length);

    }
}
