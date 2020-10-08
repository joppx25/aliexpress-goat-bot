'use strict';

const commands      = require('../command');
const ProductType   = require('../../ProductType');

/**
 * Run scraper for official site
 *
 * @param {object} options options params from command
 */
module.exports = async function run (options) {
    const { force, verbose } = options;
    await execute(force, verbose);
};

//
// ─── REGISTRATION COMMAND ──────────────────────────────────────────────────────────────────
//
module.exports.registry = {
    name       : 'aliexpress:update-product-type',
    description: 'Update products of ali for product type',
    options    : [
        {
            flag        : '-f --force <force>',
            description : 'Force to update all data',
            defaultValue: false,
        },
        {
            flag       : '-b, --verbose',
            description: 'Log more details.'
        }
    ]
};

//
// ─── FUNCTIONS ──────────────────────────────────────────────────────────────────

/**
 *
 * @param verbose
 * @returns {Promise<void>}
 */
async function execute (force, verbose) {
    const logger = commands.loggerInfo(`AliExpress product type update`, `aliexpress product type`, verbose);

    try {
        logger.info("> Start updating product type for aliexpress");

        // call scrape
        const scraper = new ProductType(force, logger);
        await scraper.execute();

        logger.info('> Done updating for aliexpress');
        process.exit();
    } catch (err) {
        logger.error(err.toString());
        process.exit(-1);
    }
}
