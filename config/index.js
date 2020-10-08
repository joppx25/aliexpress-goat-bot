'use strict';

const fs = require('fs');

/*
 * Collect separated configuration files from /config/ folder
 */
const filenames = fs.readdirSync(__dirname)
    .filter(filename => filename.startsWith('.') === false && filename !== 'index.js');

/*
 * Load configurations from files.
 */
const config = filenames.reduce((config, filename) => {
    const key = filename.split('.')[0];
    config[key] = require(`${__dirname}/${filename}`);
    return config;
}, {});

module.exports = config;

/**
 * Global function to return a set of configuration which has the configuration name,
 * or all configuration if no name is provided.
 *
 * @param {string} name configuration name
 */
global.config = function (name) {
    // Return all configuration if no configuration name is provided.
    if (name === undefined)
        return config;

    if (config[name] === undefined)
        throw new Error(`Configuration "${name}" is unavailable.`);

    return config[name];
};
