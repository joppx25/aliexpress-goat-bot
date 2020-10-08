'use strict';

const BaseModel = require('./BaseModel');

module.exports = class OrderTrackingDetail extends BaseModel {

    /**
     * Return table name
     *
     * @return string
     */
    static get tableName () {
        return 'order_tracking_details';
    }

    /**
     * Return object relation mapping
     *
     * @return object
     */
    static get relationMappings () {
        return {};
    }

    /**
     * Addig timestamp on every insert or modification of the item in table
     *
     * @return bool
     */
    static get timestamps () {
        return true;
    }
}
