'use strict';

const retry               = require('async-retry');
const rp                  = require('request-promise');
const ProductService      = require('./service/ProductService');
const common              = require('../helper/common');

const { GoatProduct,
        GoatProductImage }     = require('../database/index').models;

const DEFAULT_SLEEP       = 3000;
const MAX_SLEEP           = 12000;
const NUMBER_OF_RETRY     = 3;
const RETRY_MIN_TIMEOUT   = 60000;
const RETRY_MAX_TIMEOUT   = 90000;
const XSRF_TOKEN          = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1Njc2NDY1NTh9.FxpoUius5bcFyuyepolutXUG9hsUuaB6XYTFFMRgg1o';
const URL                 = 'https://www.goat.com/web-api/v1/recommendations/collections';
const HOST                = 'www.goat.com';

module.exports = class GoatImagecrawler {

    constructor (force, id, logger) {
        this.logger      = logger;
        this.force       = force;
        this.id          = id;
        this.offset      = 0;
        this.limit       = 1000;
        this.products    = [];
        this.data        = [];
        this.retryFlag   = false;
    }

    /**
     * function to sleep the code execution
     *
     * @param {int} ms a sleeping time value in miliseconds
     */
    sleep (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async extractData () {

        let options = {
            method: 'GET',
            url: URL,
            qs: { productTemplateId: this.id },
            headers: {
                'Connection': 'keep-alive',
                'Host': HOST,
                'authority': HOST,
                'accept': 'application/json',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
                'accept-language': 'en-US,en;q=0.9',
                'x-csrf-token': XSRF_TOKEN,
            }
        };

        return await rp(options);
    }

    async processData () {
        if (this.id) {
            this.extractData();
            return
        }

        if (!this.retryFlag) {
            this.products = await ProductService.getAllProducts(GoatProduct, ['id', 'template_id'], this.offset, this.limit);
        }

        if (this.products.length) {
            for (let product of this.products) {
                this.id = product.template_id;

                if (await ProductService.getProduct({product_id: product.id}, '*', GoatProductImage)) { // product id exist already in product image
                    this.logger.info(`> Skipping template id: ${this.id} already exist in goat product image table`);
                    continue;
                }

                this.logger.info(`> Getting image for template id: ${this.id}`);
                let jsonData = JSON.parse(await this.extractData());

                for (let image of jsonData) {
                    let imgURL   = image.web_picture.split('?')[0];
                    let filename = `${process.env.GOAT_IMAGE_PATH}/${imgURL.match(/([\w\d_-]*\.?[^\\\/]*$)/)}`;

                    await common.downloadImage(imgURL, filename);
                    this.data.push({
                        product_id: product.id,
                        url       : filename,
                        thumb_url : imgURL,
                        goat_url  : imgURL,
                    });

                    this.logger.info(`> Feature image: ${imgURL}`);
                    await this.sleep(DEFAULT_SLEEP);
                }
                this.logger.info(`> Done getting image data for template id: ${this.id}`);

                this.id = undefined; // reset
                await this.sleep(DEFAULT_SLEEP);
            }

            if (!this.data.length) {
                this.hasDataFlag = false;
                return;
            }

            // Insert all data here
            await this.insertData();

            if (this.retryFlag) this.retryFlag = false; // reset
            this.products    = [];
            this.hasDataFlag = true;
            return;
        }

        this.hasDataFlag = false;
        return;
    }

    async insertData () {
        try {
            this.logger.info(`> Inserting new data`);
            let result = await ProductService.batchInsert(this.data, GoatProductImage);
            this.logger.info(`> No. of inserted data ${result.length}`);
            this.offset += this.limit;
        } catch (err) {
            throw new Error(err);
        }
    }

    async execute () {

        const retryOption = {
            retries   : NUMBER_OF_RETRY,
            minTimeout: RETRY_MIN_TIMEOUT,
            maxTimeout: RETRY_MAX_TIMEOUT,
            onRetry   : (err, i) => {
                if (err) {
                    this.retryFlag = true;
                    this.logger.info(`number of attempts to retry : #${i}`);
                    this.logger.info(`retry for error : ${err.toString()}`);
                }
            }
        };

        await retry(async () => {
            // if anything throws, we retry
            do {
                await this.processData();
                this.logger.info('> Sleeping....');
                await this.sleep(MAX_SLEEP);
            } while (this.hasDataFlag);
        }, retryOption);
    }
}
