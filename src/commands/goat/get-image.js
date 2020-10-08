'use strict';

const commands = require('../command');
const ImagesCrawler  = require('../../GoatImagescrawler');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { force, id, verbose } = options;
    await execute(force, id, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'goat:get-images',
    description: 'Execute scraper getting the featured images from goat.com',
    options    : [
        {
            flag        : '-f --force <force>',
            description : 'Force to create new data product',
            defaultValue: false,
        },
        {
            flag        : '-i --id <id>',
            description : 'Target template id',
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
async function execute (force, id, verbose) {
    const logger = commands.loggerInfo(`Goat Scraping`, `goat`, verbose);

    try {
        logger.info("> Start scraping for goat getting product details");

        // call scrape
        const scraper = new ImagesCrawler(force, id, logger);
        await scraper.execute();

        logger.info('> Done scraping for goat');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        process.exit(-1);
    }
}
