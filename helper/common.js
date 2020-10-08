'use strict';

const axios = require('axios');
const fs    = require('fs');

module.exports = {
    generateRandomName,
    convertSize,
    isShoeSizes,
    downloadImage,
    convertCents,
};

function convertCents (usd) {
    return usd / 100;
}

async function downloadImage (url, filename) {
    axios({
        url,
        responseType: 'stream',
        gzip: true,
    }).then(response =>
        new Promise((resolve, reject) => {
            response.data
                    .pipe(fs.createWriteStream(filename))
                    .on('finish', () => resolve())
                    .on('error', e => reject(e))
        }).catch((err) => {
            return err;
        })
    );
}

function generateRandomName (len) {
    let char = 'abcdefghijklmnopqrstuvwxyz';
    let name = '';
    for (let i = 0; i < len; i++) {
        if (i === 0 || i === len - 1) {
            name += char.charAt(Math.floor(Math.random() * char.length));
        } else {
            name += '*';
        }
    }
    return name;
}

function isShoeSizes (sizes) {
    let check = false;
    for (let size of sizes) {
        if (typeof size === 'string') {
            let regexSize = size.match(/\d+(\.\d+)?/);
                size      = regexSize !== null ? regexSize[0] : '';

            if (isNaN(size) || !size) {
                check = true;
                break;
            }
        }
    }
    return check;
}

function convertSize (gender, sizes, brand) {
    let convertedSizes = [];
    let usSizes        = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5];
    let nonUSSizes     = [
        [38.5, 24],
        [39, 24.5],
        [40, 25],
        [40.5, 25.5],
        [41, 26],
        [42, 26.5],
        [42.5, 27],
        [43, 27.5],
        [44, 28],
        [44.5, 28.5],
        [45, 29],
        [45.5, 29.5],
        [46, 30],
        [47, 30.5]
    ];

    if (gender === 'female' || gender === 'woman' || gender === 'women') {
        usSizes    = [4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11];
        nonUSSizes = [
            [35, 22],
            [35.5, 22],
            [36, 22.5],
            [36.5, 23],
            [37.5, 23.5],
            [38, 24],
            [38.5, 24.5],
            [39, 25],
            [40, 25.5],
            [40.5, 26],
            [41, 26.5],
            [42, 27],
            [42.5, 27.5],
            [43, 28]
        ];
    }

    for (let size of sizes) {
        size = typeof size === 'string' ? parseFloat(size.match(/\d+(\.\d+)?/)[0]) : size;

        for (let i = 0; i < nonUSSizes.length; i++) {
            if (i <= 1 && brand === 'adidas' && (gender === 'male' || gender === 'men')) {
                let adiddasSize = [11.5, 12];
                let adiddasNonUsSize = [
                    [46, 28.5],
                    [46.5, 29]
                ];

                if (adiddasNonUsSize[i].includes(size)) {
                    convertedSizes.push(adiddasSize[i]);
                    break;
                }
            }

            if (nonUSSizes[i].includes(size)) {
                convertedSizes.push(usSizes[i]);
                break;
            } else if (i === nonUSSizes.length - 1) { // if no found size just insert to converted already
                convertedSizes.push(size);
            }
        }
    }
    return convertedSizes;
}
