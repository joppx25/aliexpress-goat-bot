'use strict';

const retry               = require('async-retry');
const rp                  = require('request-promise');
const qs                  = require('querystring');
const ProductService      = require('./service/ProductService');
const common              = require('../helper/common');

const {
    GoatProduct,
    Product,
    ProductImage,
    GoatProductImage }    = require('../database/index').models;

const NUMBER_OF_RETRY     = 3;
const RETRY_MIN_TIMEOUT   = 60000;
const RETRY_MAX_TIMEOUT   = 90000;
const DEFAULT_SLEEP_TIME  = 4000;

module.exports = class Goatcrawler {

    constructor (force, local, page, logger) {
        this.logger      = logger;
        this.force       = force;
        this.page        = page;
        this.local       = local;
        this.data        = [];
        this.hasDataFlag = false;
    }

    /**
     * function to sleep the code execution
     *
     * @param {int} ms a sleeping time value in miliseconds
     */
    sleep (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async request (postData) {
        await this.sleep(DEFAULT_SLEEP_TIME);
        let contentLen = Buffer.byteLength(postData, 'utf8');

        let options = {
            method: 'POST',
            uri: 'https://2fwotdvm2o-dsn.algolia.net/1/indexes/product_variants_v2/query',
            qs: {
                'x-algolia-application-id': '2FWOTDVM2O',
                'x-algolia-agent': 'Algolia%20for%20vanilla%20JavaScript%203.25.1',
                'x-algolia-api-key': 'ac96de6fef0e02bb95d433d8d5c7038a'
            },
            headers: {
                'content-length': contentLen,
                'accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
                'Referer': 'https://www.goat.com/sneakers',
                'Origin': 'https://www.goat.com',
                'Host': '2fwotdvm2o-dsn.algolia.net',
                'Content-Type': 'application/json',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            },
            body: JSON.parse(postData),
            json: true
        }

        return await rp(options);
    }

    async getImages (slug) {
        await this.sleep(2000);
        let payload = {
            query: `{viewer {productTemplate(slug: "${slug}") {product_template_additional_pictures {attribution_url original_picture_url source_url }}}}`,
            variables: {slug}
        };
        let options = { method: 'POST',
            url: 'https://www.goat.com/web-api/graphql',
            headers: {
                'Connection': 'keep-alive',
                'Authority': 'www.goat.com',
                'Cache-Control': 'no-cache',
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
                'x-csrf-token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1Njg2OTM3Mjl9.CB6ljmGl9BDb79cqo-eGYvCqK7-V-VAgtaNwGCK1cko',
                'Origin': 'https://www.goat.com'
            },
            body: payload,
            json: true
        };

        try {
            console.log(slug);
            let result = await rp(options);
            console.log(JSON.stringify(result));
            if (typeof result.data.viewer === 'undefined') {
                return [];
            }
            return result.data.viewer.productTemplate.product_template_additional_pictures;
        }
        catch(error) {
            console.error(error);
            // expected output: ReferenceError: nonExistentFunction is not defined
            // Note - error messages will vary depending on browser
            return [];
        }

        
    }

    async extractByPage () {
        let postData    = `{"params":"distinct=true&facetFilters=()&facets=%5B%22size%22%5D&hitsPerPage=50&numericFilters=%5B%5D&page=${this.page}&query=&clickAnalytics=true"}`;
        let dataProduct = await this.request(postData);

        await this.prepareData(dataProduct.hits);
        await this.insertData();

        this.logger.info(`> Sleep for ${DEFAULT_SLEEP_TIME} seconds`);
        await this.sleep(DEFAULT_SLEEP_TIME);
        return;
    }

    async extractBySKU () {
        let products = this.local === 'psku' ? await ProductService.getAllUniqueProductParentSKU(Product) : await ProductService.getAllProductsBySKU(Product, {is_mapped: 0, product_type: 1});

        for (let product of products) {
            let searchItem = this.local === 'psku' ? product.parent_sku : product.sku;

            if (this.local === 'psku') {
                // check if parent_sku product already have in goat table, ignore
                let goatData = await ProductService.getGoatProductsByParentSKU(GoatProduct, {parent_sku: searchItem})
                if(goatData.length > 0){
                    this.logger.info(`> Skip checking current parent sku: ${searchItem}, already have`);
                    continue;
                }
                let dataPage = 0;
                this.logger.info(`> Checking current sku: ${searchItem} product details`);
                while (true) {
                    this.logger.info(`> Craw data for page: ${dataPage}`);
                    let postData       = `{"params":"distinct=true&facetFilters=()&facets=%5B%22size%22%5D&hitsPerPage=50&numericFilters=%5B%5D&${qs.stringify({ query: searchItem })}&page=${dataPage}&clickAnalytics=true"}`;
                    let dataProduct    = await this.request(postData);

                    if (!dataProduct.hits.length || dataProduct.hits.page >=20 ) {
                        this.logger.info(`> Skipping current sku: ${searchItem}`);
                        break;
                    }

                    await this.prepareData(dataProduct.hits);
                    let insertedData = await this.insertData();

                    for (let data of insertedData) {
                        // check if this product already have image, ignore download again 
                        let downloadedImages = await ProductService.getImagesById({product_id: data.id}, GoatProductImage);
                        if(downloadedImages.length > 0){
                            this.logger.info(`> Skipping download image for ${data.template_id}, already have somes`);
                            continue;
                        }
                        this.logger.info('> Preparing image data...');
                        let images = await this.prepareImageData(JSON.parse(data.data).slug, data, 1, true);
                        this.logger.info(`> Inserting image data for template id: ${data.template_id}`);
                        await ProductService.batchInsert(images, GoatProductImage);
                    }

                    dataPage++;
                }
                this.logger.info(`> Sleep for ${DEFAULT_SLEEP_TIME} seconds`);
                await this.sleep(DEFAULT_SLEEP_TIME);

            } else {
                // replace - with space if search sku having format xxxx-xxx
                searchItem = searchItem.replace('-', ' ');
                let goatProduct = await ProductService.getProductBySKU(searchItem, GoatProduct);
            
                if (goatProduct !== undefined) {
                    // name
                    // is_mapped
                    // create new main_image
                    // create new feature images
                    let images = await ProductService.getImagesById({product_id: goatProduct.id}, GoatProductImage);
                    let is_default_feature_image = images.length > 0 ? 0 : 1;
                    await this.logger.info(`> Updating ali data with sku: ${searchItem} and product id: ${product.id}`);
                    await ProductService.updateData(
                        {
                            name: goatProduct.name,
                            sku: goatProduct.sku,
                            parent_sku: goatProduct.parent_sku,
                            description: goatProduct.description,
                            collection_slugs: goatProduct.collection_slugs,
                            is_mapped: 1,
                            is_default_feature_image
                        }, {id: product.id, ali_id: product.ali_id}, Product);
                    await this.logger.info('> Done update data');

                    // Save main
                    await this.logger.info('> Saving main image');
                    // let goatMainImage = goatProduct.main_image_goat.match(/([\w\d_-]*\.?[^\\\/]*$)/)[0];
                    //let goatMainImage = `${goatProduct.main_image_goat.replace('.com/', '.com/crop/2200/')}`;
                    let goatMainImage = goatProduct.main_image_goat;
                    await this.logger.info('> Delete old image');
                    await ProductService.deleteImageByProductId({product_id: product.id, ali_id: null, type: 0}, ProductImage);
                    await ProductService.batchInsert({
                        product_id: product.id,
                        url       : goatMainImage,
                        thumb_url : goatMainImage,
                        type      : 0,
                    }, ProductImage);

                    // Save feature
                    await this.logger.info('> Saving features image');
                    if (images.length) {
                        let imageData = [];
                        for (let image of images) {
                            imageData.push({
                                product_id : product.id,
                                //url        : `${image.goat_url.replace('.com/', '.com/crop/2200/')}`,
                                //thumb_url  : `${image.goat_url.replace('.com/', '.com/crop/150/')}`,
                                url        : image.goat_url,
                                thumb_url  : image.goat_url,
                                type       : 1,
                            });
                        }

                        await ProductService.deleteImageByProductId({product_id: product.id, ali_id: null, type: 1}, ProductImage);
                        await ProductService.batchInsert(imageData, ProductImage);
                    }
                }else {
                    this.logger.info(`> Skipping item ${searchItem} not found in goat table`);
                } 
            }
        }

        this.page = 0;
        this.hasDataFlag = false;
        return;
    }

    async prepareImageData (slug, productObj, type, isGoat = false) {

        let images = [];
        let imageRequest = await this.getImages(slug);

        if (imageRequest.length) {
            for (let image of imageRequest) {
                let mainImgPath = image.original_picture_url.match(/([\w\d_-]*\.?[^\\\/]*$)/)[0].replace(/\?\d+/g, '');
                let thumbURL    = `${mainImgPath.substring(0, mainImgPath.indexOf('.jpg'))}_thumb${mainImgPath.substring(mainImgPath.indexOf('.jpg'), mainImgPath.length)}`;
                let filename    = `${process.env.GOAT_IMAGE_PATH}/${productObj.parent_sku}_${mainImgPath}`;
                let cropImage   = `${image.original_picture_url.replace('.com/', '.com/crop/1500/')}`;
                let mainURL     = isGoat ? {goat_url: image.original_picture_url} : {ali_url: image.original_picture_url, type};

                await common.downloadImage(cropImage, filename);
                this.sleep(2000);
                images.push({
                    product_id: productObj.id,
                    url       : mainImgPath,
                    thumb_url : thumbURL,
                    ...mainURL,
                    source_url: image.source_url
                });
            }
        }
        return images;
    }

    async prepareData (jsonData) {
        this.logger.info('> Preparing data');
        if (jsonData.length) {
            this.hasDataFlag = true;
            for (let data of jsonData) {
                let splitSKU  = data.sku.split(' ');
                let sku       = data.sku;
                let parentSKU = splitSKU.length > 1 ? splitSKU[0] : data.sku;
                let categoryId = await this.searchOrSaveCategory(data.brand_name.toLowerCase());

                let uri      = data.original_picture_url;
                let filename = `${process.env.GOAT_IMAGE_PATH}/${parentSKU}_${uri.match(/([\w\d_-]*\.?[^\\\/]*$)/)}`;
                await common.downloadImage(uri, filename);
                this.sleep(1000);
                this.data.push({
                    template_id    : data.product_template_id,
                    name           : data.name,
                    sku            : sku,
                    parent_sku     : parentSKU,
                    category_id    : categoryId,
                    description    : data.story_html,
                    main_image     : filename,
                    main_image_goat: uri,
                    source_link    : `https://goat.com/sneakers/${data.slug}`,
                    data           : JSON.stringify(data),
                    used_price     : common.convertCents(data.lowest_price_cents_usd),
                    retail_price   : common.convertCents(data.retail_price_cents_usd),
                    gender         : data.single_gender,
                    color          : data.color,
                    designer       : data.designer,
                    colorway       : data.details,
                    release_date   : data.release_date,
                    technology     : data.midsole,
                    nick_name      : data.nickname,
                    material       : data.upper_material,
                    silhouette     : data.silhouette,
                    collection_slugs: JSON.stringify(data.collection_slugs)
                });
            }
            this.logger.info('> Done');
            return;
        }

        this.logger.info('> No data returned');
        this.hasDataFlag = false;
        return;
    }

    async searchOrSaveCategory(brand) {
        let data = await ProductService.getCategory({ name: brand });
        if (!data)
            data = await ProductService.insertCategory(brand);
        return data.id;
    }

    async insertData () {
        try {
            this.logger.info('> Inserting new data');
            let result = await ProductService.batchUpsert(this.data, GoatProduct);
            this.logger.info(`> No. of inserted data ${result.length}`);

            this.data = []; // reset
            if (!this.local) this.page++;

            let finalResult = [];
            for (let goatProduct of result) {
                let product = await ProductService.getProduct({template_id: goatProduct.template_id}, '*', GoatProduct);
                finalResult.push(product);
            }

            return finalResult;
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
                    this.logger.info(`number of attempts to retry : #${i}`);
                    this.logger.info(`retry for error : ${err.toString()}`);
                }
            }
        };

        await retry(async () => {
            // if anything throws, we retry
            do {
                if (this.local === 'page') {
                    await this.extractByPage();
                } else {
                    await this.extractBySKU();
                }
            } while (this.hasDataFlag);
        }, retryOption);
    }
}
