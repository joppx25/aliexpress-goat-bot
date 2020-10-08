'use strict';

const {
    BROWSER_EXE_PATH          : stringExecutablePath,
    BROWSER_NO_HEADLESS       : stringNoHeadless,
    BROWSER_IGNORE_HTTPS_ERROR: stringIgnoreHttpsError,
    BROWSER_ARGS              : stringArgs
} = process.env;

const executePath       = stringExecutablePath || null;
const headless          = stringNoHeadless !== 'false';
const ignoreHTTPSErrors = stringIgnoreHttpsError !== 'false';
const args              = stringArgs ? stringArgs.split(/\s/) : [];

const config = {
    launchingOptions: {
        executePath,
        headless,
        slowMo: 250,
        ignoreHTTPSErrors,
        args  : [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"',
            '--disable-features=site-per-process',
            '--disable-gpu',
            ...args
        ],
        defaultViewport: { width: 1366, height: 768 },
    }
};

module.exports = Object.freeze(config);
