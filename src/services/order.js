'use strict';

const { OrderTracking, OrderTrackingDetail } = require('../../database').models;
const LIMIT = 1000;

module.exports = {
    getAllOrdersNotDelivered,
    batchUpdateTrackOrder,
    batchInsertTrackOrderDetail,
    deleteRowsByStatement,
};

async function getAllOrdersNotDelivered(columns, offset, limit) {
    const arrayLimit = limit ? limit : LIMIT;

    try {
        return await OrderTracking
            .query()
            .select(columns)
            .whereIn('status', [0, 1, 3, 4]) // not found, in transit, undelivered, pickup
            .andWhere('delivery_type', 1) // t17tracks
            .offset(offset)
            .limit(arrayLimit);
    } catch(err) {
        console.log(err.message);
        process.exit(-1);
    }
}

async function batchUpdateTrackOrder(data) {
    try {
        let updatedRows = 0;
        for (let {status, total_days, current_process, original_region, destination_region, id, order_date} of data) {
            updatedRows += await OrderTracking
                .query()
                .patch({ status, total_days, current_process, original_region, destination_region, order_date })
                .where({ id });
        }
        return updatedRows;
    } catch(err) {
        return err;
    }
}

async function batchInsertTrackOrderDetail(data) {
    return await OrderTrackingDetail
        .query()
        .insertGraph(data);
}

async function deleteRowsByStatement (trx, ids) {

    const numberOfDeleteRows = await OrderTrackingDetail
        .query(trx)
        .delete()
        .whereIn('order_tracking_id', ids);

    return numberOfDeleteRows;
}
