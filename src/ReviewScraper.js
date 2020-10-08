'use strict';

const puppeteer         = require('puppeteer');
const path              = require('path');
const retry             = require('async-retry');
const fs                = require('fs');

// Models
const { Product }       = require('../database/index').models;

const SELECTORS         = require('./constant/selector');
const URLS              = require('./constant/urls');
const common            = require('../helper/common');

const ProductService    = require('./services/product');

const {
    launchingOptions }  = global.getConfig('puppeteer');

const DEFAULT_TIMEOUT   = 3000;
const MAX_TIMEOUT       = 20000;

module.exports = class ReviewScraper {

    constructor (sid, ali, logger) {
        this.logger      = logger;
        this.sid         = sid;
        this.ali         = ali;
        this.browser     = undefined;
        this.page        = undefined;
        this.pageCount   = 1;
        this.currentPage = 1;
        this.products    = [];
        this.productIdx  = 0;
        this.retryFlag   = false;
    }

    async init () {
        const preLoadFile  = fs.readFileSync(path.join(__dirname, '/preload.js'), 'utf8');
        this.browser       = await puppeteer.launch(launchingOptions);
        this.page          = await this.browser.newPage();
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
        });

        await this.page.evaluateOnNewDocument(preLoadFile);
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

        await this.page.waitForNavigation({ timeout: MAX_TIMEOUT, waitUntil: 'networkidle0' });

        return;
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
        this.logger.info('Checking captcha');

        const sliderElement = await this.page.$('#nc_1__scale_text');

        if (sliderElement) {
            const slider        = await sliderElement.boundingBox();
            const sliderHandle  = await this.page.$('#nc_1_n1z');
            const handle        = await sliderHandle.boundingBox();
            await this.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
            await this.page.mouse.down();
            await this.page.mouse.move(handle.x + slider.width, handle.y + handle.height / 2, {steps: 2});
            await this.page.mouse.up();
        }

        this.logger.info('Checking captcha done');
        return sliderElement;
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

    async getNumberOfPages () {
        await this.gotoAllProducts();
        return await this.page.$eval(SELECTORS.paginationOverallCount, (elem) => elem.textContent);
    }

    async getAllProductsForCertainPage () {
        await this.page.waitForSelector(SELECTORS.productList, { timeout: MAX_TIMEOUT, visible: true });
        return await this.page.$$eval(SELECTORS.productItem, elems => elems.map(elem => elem.getAttribute('href').match(/\d+\.html/)));
    }

    async gotoAllProducts () {
        this.logger.info('> Going to all products');

        let allProductPage = `${URLS.allProducts}${this.sid}.html`;
        await this.page.goto(allProductPage);

        while (true) {
            if (!await this.checkCaptcha()) {
                await this.logger.info('> Bypassing captcha done');
                await this.checkPromotionModal();
                return false;
            }
            this.logger.info('> Rechecking captcha');
            await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
            await this.page.goBack();
        }
    }

    async saveProductReviews (reviews) {
        try {
            let data = [];
            for (let review of reviews) {
                let productReviews = {
                    product_id           : review.product_id,
                    ali_id               : review.product_ali,
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
        } catch (err) {
            throw new Error(err);
        }
    }

    async getAvailableSKU () {
        let availableElem = await this.page.$$(SELECTORS.availableItems);
        let available     = availableElem.length ? await this.page.$$eval(SELECTORS.availableItems, elems => elems.map(elem => elem.getAttribute('title'))) : await this.page.$$eval(SELECTORS.availableItems2, elems => elems.map(elem => elem.getAttribute('title')));
        return available;
    }

    async getReviews (ali) {
        this.logger.info('Getting product reviews');

        // Check ali id is exist in product_reviews table
        let aliId             = ali.split('.html')[0];
        let productAndReviews = await ProductService.getProductAndReviews({'products.ali_id': aliId});

        if (!productAndReviews || productAndReviews.review_id) {
            this.logger.info('> Product is not exist or already have reviews');
            return [];
        }

        let productURL = `${URLS.productDetail}${ali}`;
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

        await this.page.evaluate(_ => {
            window.scrollBy(0, window.innerHeight * 5);
        });

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
                        product_ali : aliId,
                        product_id  : productAndReviews.id,
                        rating      : reviewRating,
                        sku         : reviewSKU,
                        comment     : reviewComment,
                        date        : reviewDate,
                        images      : [],
                    };

                    let reviewImages  = await reviewElem.$(SELECTORS.reviewImageWrapper);
                    if (reviewImages) {
                        this.logger.info('> Getting review images');
                        reviewImages = await reviewElem.$$eval(SELECTORS.reviewImages, elems => elems.map(elem => elem.getAttribute('src')));
                        for (let reviewImage of reviewImages) {
                            let filename = `${process.env.IMAGE_PATH}/${reviewImage.match(/([\w\d_-]*\.?[^\\\/]*$)/)[1]}`;
                            await common.downloadImage(reviewImage, filename);
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
        if (!this.retryFlag) {
            await this.login();
        }

        if (!await this.page.$(SELECTORS.flagIcon)) {
            await this.changeShippingTo();
        }

        if (this.ali) {
            let aliURL  = `${this.ali}.html`;
            let reviews = await this.getReviews(aliURL);

            try {
                if (reviews.length) {
                    this.logger.info('Saving review data');
                    await this.saveProductReviews(reviews);
                    this.logger.info('> Saving done');
                } else {
                    this.logger.info('No review data to be inserted');
                }
            } catch (err) {
                this.logger.error(err);
            }
            return;
        }

        this.pageCount = this.retryFlag ? this.pageCount : await this.getNumberOfPages();
        for (let page = this.currentPage; page <= this.pageCount; page++) {
            this.logger.info(`> Getting all ali ids in page ${page}`);


            if (!this.products.length) {
                this.products = await this.getAllProductsForCertainPage();
                this.products = this.products.map(arr => arr[0]);
            }

            let reviews   = [];
            for (this.productIdx in this.products) {
                let ali = !this.ali ? this.products[this.productIdx] : this.ali;
                let reviewData = await this.getReviews(ali);

                if (reviewData.length) {
                    reviews.push(reviewData);
                }

                if (this.productIdx > 0 && this.productIdx % 4 === 0) {
                    try {
                        this.logger.info('Saving review data');
                        reviews = reviews.map(data => {
                            for (let review of data) {
                                return review;
                            }
                        });

                        await this.saveProductReviews(reviews);
                        this.logger.info('> Saving done');
                        reviews = []; // reset
                    } catch (err) {
                        this.logger.error(err);
                    }
                }
            }

            this.currentPage++;
            this.products = []; // reset
            await this.page.waitFor(DEFAULT_TIMEOUT);
            this.logger.info('> Going to next page');
            await this.page.goto(`${URLS.aliStore}${this.sid}/search/${page + 1}.html?origin=n&SortType=bestmatch_sort`);
            await this.page.waitFor(DEFAULT_TIMEOUT);
        }
    }

    async execute () {
        const retryOption = {
            retries   : 2,
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
