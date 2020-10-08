'use strict';

const retry           = require('async-retry');

const { Product,
        MasterProductType}  = require('../database/index').models;
const ProductService  = require('./service/ProductService');

module.exports = class ProductType {

    constructor (force, logger) {
        this.force  = force;
        this.logger = logger;
        this.offset = 0;
        this.limit  = 5000;
    }

    async addProductType () {
        let products = [];
        const productTypes = await ProductService.getAllTypes(MasterProductType, ['id', 'json_list']);

        do {
            let result = [];
            if(this.force){
                products = await ProductService.getAllProducts(Product, ['id', 'name'], this.offset, this.limit);
            }else{
                products = await ProductService.getAllProductsDontHaveType(Product, ['id', 'name'], this.offset, this.limit);
            }

            for (let product of products) {
                let productName = product.name.toLowerCase();
                for (let type of productTypes) {
                    let masterProductTypes = JSON.parse(type.json_list).types.join('|').toLowerCase();
                    if (productName.match(new RegExp(`${masterProductTypes}`, 'gm'))) {
                        result.push({
                            id: product.id,
                            product_type: type.id
                        });
                        break;
                    }
                }
            }

            if (products.length) {
                this.logger.info(`Updating No. of products ${result.length}`);
                await ProductService.batchUpsert(result, Product);
            }

            this.offset += this.offset % this.limit === 0? this.limit + 1 : this.limit;
        } while (products.length);

    }

    async execute () {
        const retryOption = {
            retries   : 10,
            minTimeout: 20000,
            maxTimeout: 600000,
            onRetry   : (err, i) => {
                if (err) {
                    this.logger.info(`Number of attempts to retry : #${i}`);
                    this.logger.info(`Retry for error : ${err.toString()}`);
                }
            }
        };

        await retry(async () => {
            // if anything throws, we retry
            await this.addProductType();
        }, retryOption);
    }
}