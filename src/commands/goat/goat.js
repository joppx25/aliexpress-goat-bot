'use strict';

const commands = require('../command');
const Crawler  = require('../../Goatcrawler');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { force, local, page, verbose } = options;
    await execute(force, local, page, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'goat:get-data',
    description: 'Execute scraper getting the data from goat.com',
    options    : [
        {
            flag        : '-f --force <force>',
            description : 'Force to create new data product',
            defaultValue: false,
        },
        {
            flag        : '-l --local <local>',
            description : 'Searching products from aliexpress product to goat',
            regex       : /^(psku|sku|page)$/i,
            defaultValue: 'invalid',
        },
        {
            flag        : '-p --page <page>',
            description : 'Target page',
            defaultValue: 0,
        },
        {
            flag       : '-b, --verbose',
            description: 'Log more details.'
        },
    ]
};

//
// ─── FUNCTIONS ──────────────────────────────────────────────────────────────────

/**
 *
 * @param verbose
 * @returns {Promise<void>}
 */
async function execute (force, local, page, verbose) {
    const logger = commands.loggerInfo(`Goat Scraping`, `goat`, verbose);

    try {
        logger.info("> Start scraping for goat getting product details");

        if (local === 'invalid') {
            logger.error(`> Invalid option value for -l. Choose any of these value psku = for parent sku in ali data, sku = sku in ali data, and page = all pages for goat`);
        } else {
            // call scrape
            const scraper = new Crawler(force, local, page, logger);
            await scraper.execute();
        }

        logger.info('> Done scraping for goat');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        process.exit(-1);
    }
}
