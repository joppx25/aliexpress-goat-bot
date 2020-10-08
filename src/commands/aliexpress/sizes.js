'use strict';

const commands             = require('../command');
const ProductSizeConverter = require('../../ProductSizeConverter');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { id, verbose } = options;
    await execute( id, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'aliexpress:fix-sizes',
    description: 'Execute fix for product sizes',
    options    : [
        {
            flag        : '-i --id <id>',
            description : 'Target product id',
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
async function execute (id, verbose) {
    const logger = commands.loggerInfo(`AliExpress product size converter`, `product size`, verbose);

    try {
        logger.info("> Start fixing products");

        // call scrape
        const scraper = new ProductSizeConverter(id, logger);
        await scraper.execute();

        logger.info('> Done fixing all products');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        process.exit(-1);
    }
}
