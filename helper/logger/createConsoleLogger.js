'use strict';

const moment  = require('moment');
const {createLogger, transports, format} = require('winston');

/**
 * Setup setting for console logger.
 *
 * @param {string} label label name of logger.
 * @param {boolean} verbose flag to show all level of log or just warning level.
 */
module.exports = function (label, verbose) {
    return new createLogger({
        transports: [
            new transports.Console({
                name       : 'console-logger',
                level      : verbose ? 'silly' : 'warning',
                prettyPrint: true,
                json       : false,
                format     : format.combine(
                    format.colorize(),
                    format.timestamp({
                        format: moment().format('MM/DD/YYYY HH:mm:ss'),
                    }),
                    format.printf(
                        info  => `${info.timestamp} ${info.level}: [${label}] ${info.message}`,
                    )
                ),
            })
        ]
    });
};
