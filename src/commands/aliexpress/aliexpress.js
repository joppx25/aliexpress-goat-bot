'use strict';

const commands = require('../command');
const Scraper  = require('../../Scraper');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { force, sid, ali, ir, pd, verbose } = options;
    await execute(force, sid, ali, ir, pd, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'aliexpress:get-data',
    description: 'Execute scraper getting the data from aliexpress',
    options    : [
        {
            flag        : '-f --force <force>',
            description : 'Force to create new data product',
            defaultValue: false,
        },
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
            flag        : '-r --ir <ir>',
            description : 'include getting product with reviews',
            defaultValue: false,
        },
        {
            flag        : '-d --pd <pd>',
            description : 'getting the product description',
            defaultValue: false,
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
async function execute (force, sid, ali, ir, pd, verbose) {
    const logger = commands.loggerInfo(`AliExpress Scraping`, `aliexpress`, verbose);

    try {
        logger.info("> Start scraping for aliexpress");

        // call scrape
        const scraper = new Scraper(force, sid, ali, ir, pd, logger);
        await scraper.execute();

        logger.info('> Done scraping for aliexpress');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        process.exit(-1);
    }
}
