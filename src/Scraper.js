'use strict';

// Dependencies
const puppeteer            = require('puppeteer');

const fs                   = require('fs');
const axios                = require('axios');
const { transaction }      = require('objection');
const path                 = require('path');
const retry                = require('async-retry');

const { launchingOptions } = global.getConfig('puppeteer');
const SELECTORS            = require('./constant/selector');
const URLS                 = require('./constant/urls');

// Models
const {
    Product,
    ProductImage}   = require('../database/index').models;

// Service
const SupplierService      = require('./services/supplier');
const CategoryService      = require('./services/category');
const ProductService       = require('./services/product');

// Helper
const common               = require('../helper/common');

const DEFAULT_TIMEOUT      = 2000;
const MAX_TIMEOUT          = 20000;

module.exports = class Scrapper {

    constructor (force, sid, ali, ir, pd, logger) {
        this.logger                  = logger;
        this.force                   = force;
        this.sid                     = sid;
        this.ali                     = ali;
        this.includeReview           = ir;
        this.isGetProductDescription = pd;
        this.browser                 = undefined;
        this.page                    = undefined;
        this.data                    = {};
        this.productItems            = [];
        this.currentProduct          = '';
        this.currentPage             = '';
        this.topSellingItems         = [];
        this.retryFlag               = false;
        this.pageNumber              = 1;
        this.pageCount               = 1;
        this.doneProducts            = [];
        this.currentProdNum          = 0;
    }

    async init () {
        // Launching puppeteer and adding some config
        const preLoadFile  = fs.readFileSync(path.join(__dirname, '/preload.js'), 'utf8');
        this.browser       = await puppeteer.launch(launchingOptions);
        this.page          = await this.browser.newPage();
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
        });

        await this.page.evaluateOnNewDocument(preLoadFile);
    }

    async checkPromotionModal () {
        this.logger.info('> Checking some promotional modal');
        await this.page.waitFor(DEFAULT_TIMEOUT);

        if (await this.page.$(SELECTORS.modalClosefirst))
            await this.page.click(SELECTORS.modalClosefirst);

        if (await this.page.$(SELECTORS.modalCloseSecond))
            await this.page.click(SELECTORS.modalCloseSecond);

        this.logger.info('> Done checking promotional modal');
        return;
    }

    async checkCaptcha () {
        const sliderElement = await this.page.$('#nc_1__scale_text');

        if (sliderElement) {
            const slider        = await sliderElement.boundingBox();
            const sliderHandle  = await this.page.$('#nc_1_n1z');
            const handle        = await sliderHandle.boundingBox();
            await this.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
            await this.page.mouse.down();
            await this.page.mouse.move(handle.x + slider.width, handle.y + handle.height / 2, {steps: 20});
            await this.page.mouse.up();
        }

        return sliderElement;
    }

    async login () {
        if (!this.browser)
            await this.init();

        await this.page.goto(URLS.login);
        await this.page.waitForSelector(SELECTORS.loginFrame, { timeout: MAX_TIMEOUT, visible: true });

        const targetFrame  = await this.page.$(SELECTORS.loginFrame);
        const frameContent = await targetFrame.contentFrame();

        this.logger.info('> Logging in to aliexpress');

        const loginInput   = await frameContent.$(SELECTORS.email);
        await loginInput.click();
        await this.page.keyboard.type(process.env.ALI_EMAIL);

        await this.page.waitFor(DEFAULT_TIMEOUT);

        const passwordInput = await frameContent.$(SELECTORS.password);
        await passwordInput.click();
        await this.page.keyboard.type(process.env.ALI_PASSWORD);

        await this.page.waitFor(DEFAULT_TIMEOUT);
        const submit = await frameContent.$(SELECTORS.signin);
        await submit.click();

        return;
    }

    async downloadImage (url, filename) {
        this.logger.info(`> Downloading image: ${url}`);
        axios({
            url,
            responseType: 'stream',
            gzip: true,
        }).then(response =>
            new Promise((resolve, reject) => {
                response.data
                        .pipe(fs.createWriteStream(filename))
                        .on('finish', () => resolve())
                        .on('error', e => reject(e))
            }).catch((err) => {
                return err;
            })
        );
    }

    async autoScroll (scrollHeightCond = 700) {
        await this.page.evaluate(async (scrollHeightCond) => {
            await new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = 100;
                var timer = setInterval(() => {
                    // var scrollHeight = document.body.scrollHeight; this will cause to scroll down to the bottom
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeightCond) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        },scrollHeightCond);
    }

    async changeShippingTo () {
        await this.page.waitFor(DEFAULT_TIMEOUT);
        await this.checkPromotionModal();
        await this.page.click(SELECTORS.switcher);

        await this.page.waitForSelector(SELECTORS.country, { timeout: MAX_TIMEOUT, visible: true });
        this.logger.info('> Changing shipping country');
        await this.page.click(SELECTORS.country);

        await this.page.waitFor(DEFAULT_TIMEOUT);
        await this.page.click(SELECTORS.usCode);

        await this.page.click(SELECTORS.saveShipping);
        this.logger.info('> Done changing shipping country');

        return;
    }

    async gotoAllProducts () {
        this.logger.info('> Redirecting to all products of the store');
        await this.page.waitFor(DEFAULT_TIMEOUT);
        await this.page.goto(`${URLS.allProducts}${this.sid}.html`);

        while (true) {
            this.logger.info('> Checking for captcha');
            if (!await this.checkCaptcha()) {
                await this.logger.info('> Bypassing captcha done');
                return false;
            }
            this.logger.info('> Rechecking captcha');
            await this.page.waitForNavigation();
            await this.page.goBack();
        }
    }

    async getOverAllCount () {
        await this.gotoAllProducts();
        await this.page.waitFor(DEFAULT_TIMEOUT);
        await this.checkPromotionModal();

        return await this.page.$eval(SELECTORS.paginationOverallCount, (elem) => elem.textContent);
    }

    async getAllProductList () {
        await this.checkPromotionModal();
        await this.page.waitForSelector(SELECTORS.productList, { timeout: MAX_TIMEOUT, visible: true });
        return await this.page.$$eval(SELECTORS.productItem, elems => elems.map(elem => elem.getAttribute('href').match(/\d+\.html/)));
    }

    async gotoStoreHome () {
        let feedBackStore = `${URLS.aliStore}feedback-score/${this.sid}.html`;
        this.logger.info(`> Redirecting to feedback store ${feedBackStore}`);
        await this.page.goto(feedBackStore);

        await this.page.waitForSelector(SELECTORS.feedBackStoreFrame, { timeout: MAX_TIMEOUT, visible: true });
        const targetFrame  = await this.page.$(SELECTORS.feedBackStoreFrame);
        const frameContent = await targetFrame.contentFrame();

        this.logger.info('> Getting store information');

        let storeName      = await this.page.title();
        let storeRating    = await frameContent.$eval(SELECTORS.storeRating, elem => elem.textContent);

        this.data['supplier_ali_id']    = this.sid;
        this.data['store_name']         = storeName.split(' ')[0];
        this.data['home_page_url']      = URLS.aliStore + this.sid;
        this.data['all_product_url']    = URLS.allProducts + this.sid + '.html';
        this.data['top_rated_products'] = URLS.topRatedProducts + this.sid + '.html';
        this.data['positive_number']    = storeRating;
        this.data.products              = [];

        return;
    }

    async gotoProductDetail (productLink) {
        let productItemURL = `${URLS.productDetail}${productLink}`;
        let aliID          = parseInt(productLink.match(/\d+/)[0]);

        await this.page.goto(productItemURL);

        await this.page.waitFor(DEFAULT_TIMEOUT);
        await this.getAvailableItemAndDetail(aliID, productItemURL)
    }

    async getAvailableSKU () {
        let availableElem = await this.page.$$(SELECTORS.availableItems);
        let available     = availableElem.length ? await this.page.$$eval(SELECTORS.availableItems, elems => elems.map(elem => elem.getAttribute('title'))) : await this.page.$$eval(SELECTORS.availableItems2, elems => elems.map(elem => elem.getAttribute('title')));
        return available;
    }

    async getProductOverview () {
        this.logger.info('> Getting items description');
        await this.page.waitFor(DEFAULT_TIMEOUT);
        let overviewContent = await this.page.$eval(SELECTORS.productOverview, e => e.innerHTML);
        overviewContent     = overviewContent.replace(/^.*alt="Products-Recommended".*$/gm, ''); // remove product recommendation text
        overviewContent     = overviewContent.replace(/^.*(<table[^>]*>(?:.|\n)*(?=<\/table>)).*$/gm, ''); // remove product recommendation table
        overviewContent     = overviewContent.replace(/^.*(<script[^>]*>(?:.|\n)*(?=<\/script>)).*$/gm, ''); // remove scripttag
        this.logger.info('> Done');

        return overviewContent;
    }

    async getAvailableItemAndDetail (aliID, aliURL) {
        await this.checkPromotionModal();
        this.logger.info('> Getting available items');
        await this.page.waitFor(DEFAULT_TIMEOUT);

        let available     = await this.getAvailableSKU();
        this.logger.info('> Available items:');
        this.logger.info(`> ${available}`);

        let specs          = {};
        //let mainImageURL   = {};
        let featuredImages = [];
        let reviews        = [];
        let description    = '';
        for (let i = 0; i < available.length; i++) {
            let checkTitle = await this.page.$eval(SELECTORS.skuTitle, elem => elem.textContent.trim().split(':')[0]);
            let skuTitleVal = checkTitle.toLowerCase().match(/color|colors/) ?  await this.page.$eval(SELECTORS.skuTitleValue, elem => elem.textContent) : await this.page.$eval(SELECTORS.skuTitleValue2, elem => elem.textContent);
            if (await this.page.$(`img[title="${available[i]}"]`) === null){
                continue;
            }
            if ((!skuTitleVal && i == 0 ) || i> 0)
                await this.page.click(`img[title="${available[i]}"]`);

            let sku              = available[i];
            let name             = await this.page.$eval(SELECTORS.productTitle, elem => elem.textContent);
            //let sizes            = await this.page.$(SELECTORS.productSizes) ? JSON.stringify(await this.page.$$eval(SELECTORS.productSizes, elems => elems.map(elem => elem.textContent))) : '';
            let rating           = await this.page.$(SELECTORS.productRating) ? await this.page.$eval(SELECTORS.productRating, elem => elem.textContent) : 0;
            let orders           = await this.page.$(SELECTORS.productOrders) ? await this.page.$eval(SELECTORS.productOrders, elem => elem.textContent.match(/\d+/)[0]) : 0;
            let discountedPrice  = await this.page.$eval(SELECTORS.productDiscountedPrice, elem => elem.textContent.match(/(\d+(?:\.\d+)?)/)[0]);
            let originalPrice    = await this.page.$(SELECTORS.productOriginalPrice) ? await this.page.$eval(SELECTORS.productOriginalPrice, elem => elem.textContent.match(/(\d+(?:\.\d+)?)/)[0]) : discountedPrice;
            let productStock     = parseInt(await this.page.$eval(SELECTORS.productStocks, elem => elem.textContent.match(/\d+/)[0]));
            let productLikes     = await this.page.$(SELECTORS.productLikes) ? await this.page.$eval(SELECTORS.productLikes, elem => elem.textContent) : 0;
            let productImgUrl    = await this.page.$eval(SELECTORS.productMainImage, elem => elem.getAttribute('src'));
            let mainImageURL     = await this.getMainImage(productImgUrl, sku);

            let skuTitles        = await this.page.$$eval(SELECTORS.skuTitles, elems => elems.map(elem => elem.textContent));
            let sizeIdx          = 1;
            for (let i = 0; i < skuTitles.length; i++) {
                if (skuTitles[i].toLowerCase().match(/size|length/)) {
                    sizeIdx += i;
                    break;
                }
            }
            let sizeSelector = `div.product-info > div.product-sku > div > div:nth-child(${sizeIdx}) > ul.sku-property-list > li.sku-property-item:not(.disabled) .sku-property-text`;
            let sizes = await this.page.$(sizeSelector) ? JSON.stringify(await this.page.$$eval(sizeSelector, elems => elems.map(elem => elem.textContent))) : '';

            // get same data for every items in product
            // feature image, specs, reviews
            if (i === 0) {
                featuredImages  = await this.getFeaturedImages();

                // scroll down all the way to bottom to load components
                await this.autoScroll();

                if (this.includeReview) {
                    reviews = await this.getReviews(available)
                }

                if (this.isGetProductDescription) {
                    description = await this.getProductOverview();
                }

                specs = await this.getSpecifications();
            }

            let reviewData  = [];
            if (reviews.length) {
                for (let review of reviews) {
                    if (review.sku === sku) {
                        reviewData.push(review);
                    }
                }
            }

            this.data.products.push({
                ali_id             : aliID,
                ali_url            : aliURL,
                product_name       : name,
                sku                : sku,
                star_point         : rating,
                number_of_purchased: orders,
                price_off          : discountedPrice,
                price              : originalPrice,
                size               : sizes,
                quantity           : productStock,
                like_number        : productLikes,
                description        : description,
                main_image         : {
                    main_url: mainImageURL.mainURL,
                    ali_url : mainImageURL.aliURL
                },
                feature_images     : i === 0 ? featuredImages : [],
                specifications     : specs,
                reviews            : reviewData,
            });
        }

        this.logger.info('> Done getting all available sku items');
    }

    async getMainImage (productImgUrl, sku) {
        this.logger.info('> Getting product main image...');
        await this.page.waitFor(DEFAULT_TIMEOUT);

        let aliURL   = productImgUrl;
        let mainURL  = `${process.env.IMAGE_PATH}/${sku}_${aliURL.match(/([\w\d_-]*\.?[^\\\/]*$)/)[1]}`;

        await this.downloadImage(aliURL, mainURL);
        this.logger.info('> Done');
        mainURL = mainURL.replace(`${process.env.IMAGE_PATH}/`, '')
        return {
            mainURL,
            aliURL
        };
    }

    async getFeaturedImages () {
        let featured = [];
        this.logger.info('> Getting featured images');
        await this.page.waitFor(DEFAULT_TIMEOUT);

        let featuredImagesURI = await this.page.$$eval(SELECTORS.productFeaturedImages, elems => elems.map(elem => elem.getAttribute('src').split('_50x50.jpg')[0]));
        let filenames         = featuredImagesURI.map((uri, idx) => `${process.env.IMAGE_PATH}/${idx}_${uri.match(/([\w\d_-]*\.?[^\\\/]*$)/)[1]}`);

        for (let i = 0; i < filenames.length; i++) {
            let aliURL    = featuredImagesURI[i];
            let mainURL   = filenames[i];
            let shortName = filenames[i].replace(`${process.env.IMAGE_PATH}/`, '');
            await this.downloadImage(aliURL, mainURL);
            featured.push({
                main_url: shortName,
                ali_url : aliURL,
            });
        }
        this.logger.info('> Done');
        return featured;
    }

    async getSpecifications () {
        this.logger.info('> Getting item specification...');
        await this.page.waitForSelector(SELECTORS.specificationTab, { timeout: MAX_TIMEOUT, visible: true });

        await this.page.click(SELECTORS.specificationTab);
        await this.page.waitFor(DEFAULT_TIMEOUT);

        // await this.page.waitFor(DEFAULT_TIMEOUT);

        let specifications = {};
        let specs = await this.page.$$eval(SELECTORS.specificationItems, elems => elems.map(elem => elem.textContent.split(':')));
        specs.forEach((arrSpec) => {
            specifications[arrSpec[0].toLocaleLowerCase().trim()] = arrSpec[1].toLocaleLowerCase().trim();
        });
        this.logger.info('> Done');
        return specifications;
    }

    async getReviews (productSKUS) {
        this.logger.info('> Getting product reviews');
        await this.page.waitFor(DEFAULT_TIMEOUT);

        let reviews = [];
        let reviewText = await this.page.$eval(SELECTORS.feedbackTabText, elem => elem.textContent);
        let reviewCount = reviewText.match(/\d+/)[0];
        if (!parseInt(reviewCount)) {
            this.logger.info('> No reviews available');
            return reviews;
        }

        this.logger.info('> Changing tab to reviews');
        await this.page.click(SELECTORS.feedbackTabInner);
        this.logger.info('> Changing tab done');

        await this.page.waitFor(DEFAULT_TIMEOUT);
        const targetFrame  = await this.page.$(SELECTORS.productEvaluationFrame);
        const frameContent = await targetFrame.contentFrame();

        await this.page.waitFor(DEFAULT_TIMEOUT);
        await frameContent.click(SELECTORS.productFeedBackWrapper);

        this.logger.info('> Changing reviews to positive');
        await frameContent.hover(SELECTORS.productFeedbackDropdown);
        await frameContent.waitForSelector(SELECTORS.productPositiveOption, { timeout: MAX_TIMEOUT, visible: true });

        await frameContent.click(SELECTORS.productPositiveOption);
        this.logger.info('> Change done');

        this.logger.info('> Getting positive count');
        await frameContent.waitFor(DEFAULT_TIMEOUT);
        await frameContent.waitForSelector(SELECTORS.productPositiveCount, { timeout: MAX_TIMEOUT, visible: true });

        let positiveCount = parseInt(await frameContent.$eval(SELECTORS.productPositiveCount, elem => elem.textContent));
        if (positiveCount > 200) {
            await this.page.waitFor(DEFAULT_TIMEOUT);
            let photoTab = await frameContent.$(SELECTORS.productFeedbackPhotoOption);
            await photoTab.click();
        }

        this.logger.info(`> Positive count ${positiveCount}`);

        let paging = Math.floor(positiveCount / 10);
        if (positiveCount % 10 !== 0)
            paging++;

        for (let i = 1; i <= paging; i++) {
            await this.page.waitFor(DEFAULT_TIMEOUT);

            if (i > 1) {
                this.logger.info(`> Clicking page ${i}`);
                await frameContent.click(`${SELECTORS.productFeedbackPageWrapper} a[pageno="${i}"]`);

                await this.page.waitFor(DEFAULT_TIMEOUT)
                await frameContent.click(SELECTORS.feedBackWrapper);
            }

            let reviewElems = await frameContent.$$(SELECTORS.productFeedBackWrapper);
            this.logger.info('> Getting each product review data');

            for (const reviewElem of reviewElems) {
                let reviewRating     = await reviewElem.$eval(SELECTORS.reviewRating, elem => elem.style.width);
                let reviewSKU        = await reviewElem.$eval(SELECTORS.reviewSKU, elem => elem.nextSibling.textContent.trim());
                let reviewComment    = await reviewElem.$eval(SELECTORS.reviewComment, elem => elem.textContent);
                let reviewDate       = await reviewElem.$eval(SELECTORS.reviewDate, elem => elem.textContent);

                let reviewRawData = {};
                if (reviewComment && productSKUS.includes(reviewSKU)) {
                    reviewRawData = {
                        rating : reviewRating,
                        sku    : reviewSKU,
                        comment: reviewComment,
                        date   : reviewDate,
                        images : [],
                    };

                    let reviewImages  = await reviewElem.$(SELECTORS.reviewImageWrapper);
                    if (reviewImages) {
                        this.logger.info('> Getting review images');
                        reviewImages = await reviewElem.$$eval(SELECTORS.reviewImages, elems => elems.map(elem => elem.getAttribute('src')));
                        for (let reviewImage of reviewImages) {
                            let filename = `${process.env.IMAGE_PATH}/${reviewImage.match(/([\w\d_-]*\.?[^\\\/]*$)/)[1]}`;
                            await this.downloadImage(reviewImage, filename);
                            reviewRawData.images.push(filename);
                        }
                        this.logger.info('> Done');
                    }

                    reviews.push(reviewRawData);
                }
            }
            this.logger.info('> Done getting review');
        }
        this.logger.info('> Done');
        return reviews;
    }

    async saveSupplier (trx) {

        let supplierData = {
            supplier_ali_id      : this.data.supplier_ali_id,
            name                 : this.data.store_name,
            home_page_url        : this.data.home_page_url,
            all_product_url      : this.data.all_product_url,
            top_rated_product_url: this.data.top_rated_products,
            positive_number      : this.data.positive_number,
        };

        return await SupplierService.insertSupplier(trx, supplierData);
    }

    async saveCategory (brandName) {

        let data = await CategoryService.getCategory({ name: brandName });

        this.logger.info('> Checking category is exist');
        if (!data) {
            this.logger.info('> Saving new product category');
            data = await CategoryService.insertCategory(brandName);
            this.logger.info('> Saving new product category done');
        }
        this.logger.info('> Checking done');
        return data.id;
    }

    async saveProduct(trx) {

        let productData    = [];
        let data           = {};

        try {
            for (let product of this.data.products) {
                let splittedSKU = product.sku.split(/-|\s/);

                data = {
                    supplier_id             : this.sid,
                    ali_id                  : product.ali_id,
                    ali_url                 : product.ali_url,
                    category_id             : await this.saveCategory(product.specifications['brand name']),
                    name                    : product.product_name,
                    star_point              : parseFloat(product.star_point),
                    like_number             : parseInt(product.like_number),
                    price                   : parseFloat(product.price),
                    price_off               : parseFloat(product.price_off),
                    number_of_purchased     : parseInt(product.number_of_purchased),
                    quantity                : product.quantity,
                    parent_sku              : splittedSKU.length > 1 ? splittedSKU[0] : product.sku,
                    sku                     : product.sku,
                    gender                  : product.specifications['gender'] || '',
                    size                    : product.size,
                    specification           : JSON.stringify(product.specifications),
                    description             : product.description,
                    is_top                  : 0,
                    is_default_feature_image: 1,
                    is_default_main_image   : 1,
                    is_custom_image         : 0,
                    is_mapped               : 0,
                    exported_date           : null,
                    product_images          : [],
                    product_reviews         : [],
                };

                // Main image
                data.product_images.push({
                    ali_id     : product.ali_id,
                    ali_url    : product.main_image.ali_url,
                    url        : product.main_image.main_url,
                    thumb_url  : product.main_image.main_url,
                    type       : 0,
                });

                if (product.hasOwnProperty('reviews') && product.reviews.length) {
                    let productReviews = {};
                    for (let review of product.reviews) {
                        if (review.sku === product.sku) {
                            productReviews = {
                                ali_id               : product.ali_id,
                                user_name            : common.generateRandomName(5),
                                user_review          : review.comment,
                                star                 : review.rating,
                                review_date          : review.date,
                                product_review_images: [],
                            };

                            if (review.hasOwnProperty('images')) {
                                for (let image of review.images) {
                                    productReviews.product_review_images.push({
                                        url      : image,
                                        thumb_url: image,
                                    });
                                }
                            }
                            data.product_reviews.push(productReviews);
                        }
                    }
                }

                productData.push(data);
            }

            let productResult = await ProductService.batchInsert(trx, productData, Product);
            this.logger.info(`> No. of inserted products ${productResult.length}`);

            this.logger.info('> Inserting featured images');
            let featuredImages = [];
            productResult.map((product, index) => {
                let featuredImage = this.data.products[index].feature_images;

                if (featuredImage.length) {
                    for (let image of featuredImage) {
                        featuredImages.push({
                            product_id : null,
                            ali_id     : product.ali_id,
                            ali_url    : image.ali_url,
                            url        : image.main_url,
                            thumb_url  : image.main_url,
                            type       : 1,
                        });
                    }
                }
            });

            let result = await ProductService.batchInsert(trx, featuredImages, ProductImage);
            this.logger.info(`> No. of featured images inserted ${result.length}`);
        } catch (err) {
            return err;
        }
    }

    async saveProductReviews (reviews) {

        let data = [];
        for (let review of reviews) {
            let productReviews = {
                product_id           : review.product_id,
                ali_id               : this.ali_id,
                user_name            : common.generateRandomName(5),
                user_review          : review.comment,
                star                 : review.rating,
                review_date          : review.date,
                product_review_images: [],
            };

            if (review.hasOwnProperty('images')) {
                for (let image of review.images) {
                    productReviews.product_review_images.push({
                        url      : image,
                        thumb_url: image,
                    });
                }
            }
            data.push(productReviews);
        }

        let result = await ProductService.insertProductReviewsAndImages(data);
        this.logger.info(`> No. of product reivews ${result.length}`);
    }

    async updateTopProducts (productItems) {
        let data = [];
        for (let topProduct of this.topSellingItems) {
            for (let productItem of productItems) {
                if (productItem === topProduct) {
                    let aliID = productItem.split('.html')[0];
                    data.push({
                        is_top: 1,
                        where: { ali_id: aliID },
                    });
                }
            }
        }

        let result = await ProductService.batchUpdateProduct(data);
        this.logger.info(`> No. of products updated ${result}`);
    }

    async getTopSellingProducts () {
        await this.page.goto(`${URLS.topRatedProducts}${this.sid}.html`);
        await this.page.waitForSelector(SELECTORS.productList, { timeout: MAX_TIMEOUT, visible: true });

        return await this.page.$$eval(SELECTORS.productItem, elems => elems.map(elem => elem.getAttribute('href').match(/\d+\.html/)));
    }

    async getReviewsByAli () {
        // Check ali id is exist in product_reviews table
        let productAndReviews = await ProductService.getProductAndReviews({'products.ali_id': this.ali});

        if (productAndReviews.review_id) {
            this.logger.info('> ALI ID is already have reviews.');
            return [];
        }

        if (!this.retryFlag) {
            await this.login();
            await this.page.waitForNavigation({ waitUntil: "networkidle0" });
        }

        let productURL = `${URLS.productDetail}${this.ali}.html`;
        this.logger.info(`Redirecting to ${productURL}`);
        await this.page.goto(productURL);

        await this.checkPromotionModal();
        let productSKUS = await this.getAvailableSKU();
        this.logger.info('Available SKU items: ');
        this.logger.info(productSKUS);

        await this.page.waitFor(DEFAULT_TIMEOUT);
        await this.page.click(SELECTORS.productOverviewTab);
        await this.page.waitForSelector(SELECTORS.productDesc, { timeout: MAX_TIMEOUT, visible: true });
        await this.page.click(SELECTORS.productDesc);

        let reviews     = [];
        let reviewText  = await this.page.$eval(SELECTORS.feedbackTabText, elem => elem.textContent);
        let reviewCount = reviewText.match(/\d+/)[0];
        if (!parseInt(reviewCount)) {
            this.logger.info('> No reviews available');
            return reviews;
        }

        this.logger.info('> Changing tab to reviews');
        await this.page.click(SELECTORS.feedbackTabInner);
        this.logger.info('> Changing tab done');

        await this.page.waitFor(DEFAULT_TIMEOUT);
        const targetFrame  = await this.page.$(SELECTORS.productEvaluationFrame);
        const frameContent = await targetFrame.contentFrame();

        await this.page.waitFor(DEFAULT_TIMEOUT);
        await frameContent.click(SELECTORS.productFeedBackWrapper);

        this.logger.info('> Changing reviews to positive');
        await frameContent.hover(SELECTORS.productFeedbackDropdown);
        await frameContent.waitForSelector(SELECTORS.productPositiveOption, { timeout: MAX_TIMEOUT, visible: true });

        await frameContent.click(SELECTORS.productPositiveOption);
        this.logger.info('> Change done');

        this.logger.info('> Getting positive count');
        await frameContent.waitFor(DEFAULT_TIMEOUT);
        await frameContent.waitForSelector(SELECTORS.productPositiveCount, { timeout: MAX_TIMEOUT, visible: true });

        let positiveCount = parseInt(await frameContent.$eval(SELECTORS.productPositiveCount, elem => elem.textContent));
        if (positiveCount > 200) {
            await this.page.waitFor(DEFAULT_TIMEOUT);
            let photoTab = await frameContent.$(SELECTORS.productFeedbackPhotoOption);
            await photoTab.click();
        }

        this.logger.info(`> Positive count ${positiveCount}`);

        let paging = Math.floor(positiveCount / 10);
        if (positiveCount % 10 !== 0)
            paging++;

        for (let i = 1; i <= paging; i++) {
            await this.page.waitFor(DEFAULT_TIMEOUT);

            if (i > 1) {
                this.logger.info(`> Clicking page ${i}`);
                await frameContent.click(`${SELECTORS.productFeedbackPageWrapper} a[pageno="${i}"]`);

                await this.page.waitFor(DEFAULT_TIMEOUT)
                await frameContent.click(SELECTORS.feedBackWrapper);
            }

            let reviewElems = await frameContent.$$(SELECTORS.productFeedBackWrapper);
            this.logger.info('> Getting each product review data');

            for (const reviewElem of reviewElems) {
                let reviewRating     = await reviewElem.$eval(SELECTORS.reviewRating, elem => elem.style.width);
                let reviewSKU        = await reviewElem.$eval(SELECTORS.reviewSKU, elem => elem.nextSibling.textContent.trim());
                let reviewComment    = await reviewElem.$eval(SELECTORS.reviewComment, elem => elem.textContent);
                let reviewDate       = await reviewElem.$eval(SELECTORS.reviewDate, elem => elem.textContent);

                let reviewRawData = {};
                if (reviewComment && productSKUS.includes(reviewSKU)) {
                    reviewRawData = {
                        product_id: productAndReviews.id,
                        rating    : reviewRating,
                        sku       : reviewSKU,
                        comment   : reviewComment,
                        date      : reviewDate,
                        images    : [],
                    };

                    let reviewImages  = await reviewElem.$(SELECTORS.reviewImageWrapper);
                    if (reviewImages) {
                        this.logger.info('> Getting review images');
                        reviewImages = await reviewElem.$$eval(SELECTORS.reviewImages, elems => elems.map(elem => elem.getAttribute('src')));
                        for (let reviewImage of reviewImages) {
                            let filename = `${process.env.IMAGE_PATH}/${reviewImage.match(/([\w\d_-]*\.?[^\\\/]*$)/)[1]}`;
                            await this.downloadImage(reviewImage, filename);
                            reviewRawData.images.push(filename);
                        }
                        this.logger.info('> Done');
                    }

                    reviews.push(reviewRawData);
                }
            }
            this.logger.info('> Done getting review');
        }
        this.logger.info('> Done');
        return reviews;
    }

    async crawl () {
        let trx;
        const knex = Product.knex();

        if (!this.retryFlag) {
            await this.login();
        }

        if (!await this.page.$(SELECTORS.flagIcon)) {
            await this.changeShippingTo();
        }

        await this.page.waitFor(DEFAULT_TIMEOUT);

        if (!this.data.hasOwnProperty('supplier_ali_id')) {
            await this.gotoStoreHome();
        }

        // case craw data for only specifict ali product
        if (this.ali){
            //@todo
            // implement logic for get only data for specifict ali product
            // if product is new, create, if exits, update data
        }
        // case craw data for all products
        let supplierInfo = await SupplierService.getSupplier({supplier_ali_id: this.data.supplier_ali_id});

        if (!this.data.products.length) {
            this.pageCount   = await this.getOverAllCount();

            this.logger.info('> Getting top selling products');
            let topSelling = await this.getTopSellingProducts();
            this.topSellingItems = topSelling.map(arr => arr[0]);
            this.logger.info('> Done getting top selling products');

            await this.gotoAllProducts();
        }

        for (let i = this.pageNumber; i <= this.pageCount; i++) {
            let finishProducts = [];
            let idx            = 1;

            if (!this.productItems.length) {
                this.productItems = await this.getAllProductList();
                this.productItems = this.productItems.map(arr => arr[0]);
            }

            this.logger.info(`> Getting each product details in page ${i}`);

            for (this.currentProdNum in this.productItems) {
                let item            = this.productItems[this.currentProdNum];
                this.currentProduct = item.split('.html')[0];

                this.logger.info(`> Checking current product is exist ${this.currentProduct}`);
                let isProductExist = await ProductService.getProductByAliID(this.currentProduct, Product);
                if (isProductExist) {
                    this.logger.info(`> Skipping current ali id ${this.currentProduct} already exist in products table`);
                    continue;
                }
                this.logger.info('> Checking done');

                this.logger.info(`> Getting product detail for ${item}`);
                await this.gotoProductDetail(item);

                if (idx % 1 === 0) {
                    this.logger.info('> Saving current data aggregated');

                    try {
                        this.logger.info('> Start transaction');
                        trx = await transaction.start(knex);

                        this.logger.info('> Checking if supplier is already exist');
                        if (supplierInfo === undefined) {
                            this.logger.info('> Saving supplier info');
                            supplierInfo = await this.saveSupplier(trx);
                            this.logger.info('> New supplier added');
                        }
                        this.logger.info('> Checking done');

                        this.logger.info('> Saving product data');
                        await this.saveProduct(trx);
                        this.logger.info('> Done saving product data');

                        this.data.products = [];
                        await trx.commit();
                    } catch (err) {
                        await trx.rollback();
                        this.logger.error(err);
                        this.logger.error('> Something went wrong, rolling back');
                    }

                    this.logger.info('> Done');
                }

                idx++;
                finishProducts.push(item);
            }
            this.logger.info(`> Done for page ${i}`);

            if (finishProducts.length) {
                this.logger.info('> Updating for top selling product');

                this.updateTopProducts(finishProducts);
                finishProducts = []; // reset

                this.logger.info('> Done updating top products');
            }

            this.pageNumber++;
            this.productItems = []; // reset
            await this.page.waitFor(DEFAULT_TIMEOUT);
            this.logger.info('> Going to next page');
            this.currentPage = `${URLS.aliStore}${this.sid}/search/${i + 1}.html?origin=n&SortType=bestmatch_sort`;
            await this.page.goto(this.currentPage);
            await this.page.waitFor(DEFAULT_TIMEOUT);
        }
    }

    async execute () {
        const retryOption = {
            retries   : 10,
            minTimeout: 20000,
            maxTimeout: 600000,
            onRetry   : (err, i) => {
                if (err) {
                    this.retryFlag = true;
                    this.logger.info(`Number of attempts to retry : #${i}`);
                    this.logger.info(`Retry for error : ${err.toString()}`);
                }
            }
        };

        await retry(async () => {
            // if anything throws, we retry
            await this.crawl();
        }, retryOption);
    }
}
