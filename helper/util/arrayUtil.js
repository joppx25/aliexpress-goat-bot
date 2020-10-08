'use strict';

module.exports = {
    chunkBySize
};

/**
 * Chunk array by given chunk size
 * [1,2,3,4,5,6,7] chunkBySize(3) will be [[1,2,3],[4,5,6],[7]]
 *
 * @param {string} dateTimeString date time string
 *
 * @return {number} a month of given date tim string
 */
function chunkBySize (array, chunkSize) {

    return [].concat.apply([],
        array.map(function (elem, i) {
            return i % chunkSize ? [] : [array.slice(i, i + chunkSize)];
        })
    );
}
