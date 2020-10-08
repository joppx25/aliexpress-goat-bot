'use strict';

const commands      = require('../command');
const ReviewScraper = require('../../ReviewScraper');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { sid, ali, verbose } = options;
    await execute( sid, ali, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'aliexpress:get-reviews',
    description: 'Execute scraper getting the reviews for certain ali id',
    options    : [
        {
            flag        : '-s --sid <sid>',
            description : 'Target store id',
            defaultValue: 1184043,
        },
        {
            flag        : '-a --ali <ali>',
            description : 'Target ali id',
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
async function execute (sid, ali, verbose) {
    const logger = commands.loggerInfo(`AliExpress Review Scraping`, `aliexpress review`, verbose);

    try {
        logger.info("> Start scraping for aliexpress");

        // call scrape
        const scraper = new ReviewScraper(sid, ali, logger);
        await scraper.execute();

        logger.info('> Done scraping for aliexpress');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        process.exit(-1);
    }
}
