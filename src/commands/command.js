'use strict';

const mtz           = require('moment-timezone');
const moment        = require('moment');
const loggerFactory = require('../../helper/logger');

/**
 * getting logger information to use if file logger or console logger
 * @param {string} label
 * @param {string} fileLog
 * @param {object} verbose
 */
const loggerInfo = (label, fileLog, verbose) => {
    return ('file' === process.env.LOGGING_MOD)
        ? loggerFactory.createFileLogger(label, fileLog)
        : loggerFactory.createConsoleLogger(label, verbose);
};

module.exports = {
    mtz,
    moment,
    loggerInfo,
};
