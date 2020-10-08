'use strict';

const commands     = require('../command');
const Crawler      = require('../../TrackCrawler');
const SlackService = require('../../service/SlackService');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { force, code, verbose } = options;
    await execute(force, code, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'track:get-order-status',
    description: 'Execute scraper getting the order status from t.17track.net',
    options    : [
        {
            flag        : '-f --force <force>',
            description : 'Force to create new data product',
            defaultValue: false,
        },
        {
            flag        : '-c --code <code>',
            description : 'Searching status for tracking code',
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
async function execute (force, code, verbose) {
    const logger = commands.loggerInfo(`17track scraper`, `17track`, verbose);

    try {
        await SlackService.postNotificationToSlack('Checking order status', 'BOT', 'Start 17track SCRAPING', 'info');
        logger.info("> Start scraping for 17track getting order status");

        const scraper = new Crawler(force, code, logger);
        await scraper.execute();

        logger.info('> Done scraping for t.17track.net');
        await SlackService.postNotificationToSlack('Done checking order status', 'BOT', 'End 17track SCRAPING', 'success');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        await SlackService.postNotificationToSlack(err.toString(), 'BOT', 'ERROR 17track SCRAPING', 'error');
        process.exit(-1);
    }
}
