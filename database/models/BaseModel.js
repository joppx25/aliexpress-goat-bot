'use strict';

const moment    = require('moment');
const { Model } = require('objection');

module.exports = class BaseModel extends Model {

    $beforeInsert () {
        if (this.constructor.timestamps) {
            this.created_at = moment().format('YYYY-MM-DD H:mm:ss');
            this.updated_at = moment().format('YYYY-MM-DD H:mm:ss');
        }
    }

    $beforeUpdate () {
        if (this.constructor.timestamps) {
            this.updated_at = moment().format('YYYY-MM-DD H:mm:ss');
        }
    }

};
