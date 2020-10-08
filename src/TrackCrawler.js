// Dependencies
const retry                = require('async-retry');
const puppeteer            = require('puppeteer');
const { transaction }      = require('objection');
const moment               = require('moment');

const { launchingOptions } = global.getConfig('puppeteer');
const OrderService         = require('./services/order');
const SlackService         = require('./service/SlackService');
const { OrderTracking }    = require('../database/index').models;

const STATUSES = [
    'Not found',
    'In transit',
    'Delivered',
    'Undelivered',
    'Pick up'
];

const DEFAULT_TIMEOUT      = 1000;
const MAX_TIMEOUT          = 20000;

module.exports = class TrackCrawler {

    constructor(force, code, logger) {
        this.force            = force;
        this.code             = code;
        this.logger           = logger;
        this.page             = undefined;
        this.browser          = undefined;
        this.retryFlag        = false;
        this.mainPageURL      = 'https://t.17track.net/en';
        this.orderTrackingIds = [];
        this.orderTrack       = [];
        this.orderTrackDetail = [];
        this.offset           = 0;
        this.limit            = 5000;
        this.currentOrderIdx  = 0;
        this.orders           = [];
    }

    async init() {
        if (this.browser !== undefined)
            await this.browser.close();

        this.browser       = await puppeteer.launch(launchingOptions);
        this.page          = await this.browser.newPage();
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
        });
    }

    async updateOrderTrackingData() {
        let result = await OrderService.batchUpdateTrackOrder(this.orderTrack);
        this.logger.info(`> No. of order(s) updated: ${result}`);
    }

    async insertOrderTrackingDetail(trx) {

        const numberOfDeleteRows = await OrderService
            .deleteRowsByStatement(trx, this.orderTrackingIds);
        this.logger.info(`> Before inserting, delete ${numberOfDeleteRows} old row(s)`);

        let result = await OrderService.batchInsertTrackOrderDetail(this.orderTrackDetail);
        this.logger.info(`> No. of order detail(s) inserted: ${result.length}`);
    }

    formatData(orderTrackingId, datetimes, details, region) {
        for (let i = 0; i < details.length; i++) {
            this.orderTrackDetail.push({
                order_tracking_id: orderTrackingId,
                date             : datetimes[i],
                status_text      : details[i],
                type             : region,
            });
        }
    }

    async crawl() {
        let trx;
        const knex = OrderTracking.knex();

        while (true) {
            this.logger.info('> Checking all tracking orders in tracking_orders table');
            this.orders = await OrderService.getAllOrdersNotDelivered(['id', 'order_id', 'site', 'tracking_code', 'status', 'current_process', 'total_days'], this.offset, this.limit);

            if (!this.orders.length) {
                this.logger.info('> No track orders found');
                break;
            }

            this.logger.info('> Checking done! Launching crawler...');

            if (!this.retryFlag) {
                await this.init();
                await this.page.goto(this.mainPageURL);
                await this.page.waitFor(DEFAULT_TIMEOUT);

                let isModalExist = await this.page.$eval('#modal-gdpr', e => e.innerHTML);
                if (isModalExist.length) {
                    this.logger.info('> Agree terms and condition!');
                    await this.page.click('#modal-gdpr .yq-modal-dialog .modal-content .modal-footer button');
                }

                await this.page.waitFor(DEFAULT_TIMEOUT);
                this.retryFlag = true;
            }

            // if (!this.code) { // no need this time
            for (let i = this.currentOrderIdx; i < this.orders.length; i++) {
                let order = this.orders[i];
                // reset data
                this.orderTrackingIds = [];
                this.orderTrack       = [];
                this.orderTrackDetail = [];

                this.logger.info(`> Checking process for #${order.tracking_code}`);
                await this.page.goto(`${this.mainPageURL}#nums=${order.tracking_code}`);
                await this.page.waitFor(DEFAULT_TIMEOUT);

                await this.page.waitFor(DEFAULT_TIMEOUT);
                if (await this.page.$('a.introjs-skipbutton')) {
                    this.logger.info('> Clicking tutorial skip button');
                    await this.page.click('a.introjs-skipbutton');
                    await this.page.waitFor(DEFAULT_TIMEOUT);
                }

                let orderTrackingId = order.id;
                let trackingOrder   = order.tracking_code;
                let statusInPage    = await this.page.$eval(`#tn-${trackingOrder} a`, e => e.getAttribute('title'));
                if(statusInPage === 'Not found') {
                    this.logger.info('> Skip checking, not found');
                    continue;
                }

                // Translate orig and destination block
                this.logger.info('> Translating original and destination region status text');
                let scrollableContentElem = 'article.track-container .scrollable-content';
                await this.page.evaluate(selector => {
                    const scrollableElem = document.querySelector(selector);
                    scrollableElem.scrollTop = scrollableElem.offsetHeight;
                }, scrollableContentElem);

                if(await this.page.$(`input[data-yq-events="startTranslating(${order.tracking_code})"]`) === null){
                    this.logger.info('> Skip checking, something went wrong');
                    continue;
                }

                await this.page.click(`input[data-yq-events="startTranslating(${order.tracking_code})"]`);
                await this.page.waitFor(DEFAULT_TIMEOUT * 2);

                // Check status if updated
                let currentStatus   = STATUSES[order.status];
                let isFoundStatus   = await this.page.$(`#tn-${trackingOrder} a[title^="${currentStatus}"]`);

                let totalDays       = !isFoundStatus && statusInPage.search('Delivered') !== -1? statusInPage.match(/\d+/)[0] : 0;
                let currentProcess  = await this.page.$(`#tn-${trackingOrder} .tracklist-header span[data-newevents]`)? await this.page.$eval(`#tn-${trackingOrder} .tracklist-header span[data-newevents]`, e => e.innerHTML) : '';
                let statusDateDes   = '';
                let statusTextDes   = '';
                let statusDateOrig  = '';
                let statusTextOrig  = '';

                if (currentProcess) {
                    statusDateDes  = await this.page.$$eval(`#tn-${trackingOrder} .tracklist-details div .des-block dd div time`, elem => elem.map(e => e.innerHTML));
                    statusTextDes  = await this.page.$$eval(`#tn-${trackingOrder} .tracklist-details div .des-block dd div p`, elem => elem.map(e => e.innerHTML));
                    statusDateOrig = await this.page.$$eval(`#tn-${trackingOrder} .tracklist-details div .ori-block dd div time`, elem => elem.map(e => e.innerHTML));
                    statusTextOrig = await this.page.$$eval(`#tn-${trackingOrder} .tracklist-details div .ori-block dd div p`, elem => elem.map(e => e.innerHTML));
                }

                if (statusInPage.search('Delivered') !== -1) {
                    // Ping slack here
                    let msg = `Order id #${order.order_id} from site #${order.site} is completed, total delivery time is ${totalDays} day(s)`;
                    await SlackService.postNotificationToSlack(msg, 'BOT', `ORDER #${order.order_id} - ${order.tracking_code}`, 'success');
                }
                // get first shipping date
                let firstDate = await this.page.$eval(`#tn-${trackingOrder} .tracklist-details div .ori-block dd:last-of-type div time`, e => e.innerHTML);
                this.orderTrack.push({
                    id                : orderTrackingId,
                    status            : totalDays? 2 : (statusInPage === 'In transit' )? 1 : (statusInPage === 'Undelivered')? 3 : (statusInPage === 'Pick up')? 4  : 0,
                    original_region   : statusInPage === 'Not found'? '' : await this.page.$eval(`#tn-${trackingOrder} .tracklist-header .from span[data-country]`, e => e.innerHTML),
                    destination_region: statusInPage === 'Not found'? '' : await this.page.$eval(`#tn-${trackingOrder} .tracklist-header .to span[data-country]`, e => e.innerHTML),
                    total_days        : parseInt(totalDays),
                    current_process   : currentProcess,
                    order_date        : moment(firstDate).format('YYYY-MM-DD')
                });

                this.formatData(orderTrackingId, statusDateDes, statusTextDes, 2);
                this.formatData(orderTrackingId, statusDateOrig, statusTextOrig, 1);
                this.orderTrackingIds.push(orderTrackingId);

                try {
                    this.logger.info('> Start transaction');
                    trx = await transaction.start(knex);

                    this.logger.info('> Updating order tracking table');
                    await this.updateOrderTrackingData(this.trackingOrder);

                    this.logger.info('> Inserting order tracking detail');
                    await this.insertOrderTrackingDetail(this.tracking);

                    this.currentOrderIdx = i;
                    await trx.commit();
                } catch (err) {
                    await trx.rollback();
                    this.logger.error(err);
                    await SlackService.postNotificationToSlack(err, 'BOT', 'ERROR 17track SCRAPING', 'error');
                    this.logger.error('> Something went wrong, rolling back');
                }
            }
            // }

            this.offset += this.offset % this.limit === 0? this.limit + 1 : this.limit;
            this.currentOrderIdx = 0;
            this.orders          = [];
        }

        if (this.browser !== undefined)
            await this.browser.close();
            
        return;
    }

    async execute() {
        const retryOption = {
            retries   : 10,
            minTimeout: 20000,
            maxTimeout: MAX_TIMEOUT,
            onRetry   : (err, i) => {
                if (err) {
                    this.retryFlag = true;
                    this.logger.info(`> Number of attempts to retry : #${i}`);
                    this.logger.info(`> Retry for error : ${err.toString()}`);
                }
            }
        };

        await retry(async () => {
            // if anything throws, we retry
            await this.crawl();
        }, retryOption);
    }

}
