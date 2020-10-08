'use strict';

const moment                             = require('moment');
const {createLogger, transports, format} = require('winston');
require('winston-daily-rotate-file');

/**
 * Setup setting for file logger.
 *
 * @param {string} label label name of logger.
 */
module.exports = function (label, fileName) {
    return new createLogger({
        transports: [
            new transports.DailyRotateFile({
                name       : 'daily-file-logger',
                level      : 'silly',
                json       : true,
                prettyPrint: true,
                format     : format.combine(
                    format.timestamp({
                        format: moment().format('MM/DD/YYYY HH:mm:ss'),
                    }),
                    format.printf(
                        info => `${info.timestamp} ${info.level}: [${label}] ${info.message}`
                    ),
                ),
                filename   : `${process.env.LOGGING_ROOT}/${fileName}-%DATE%.log`,
                datePattern: 'YYYYMMDD',
            })
        ]
    });
};
