'use strict';

const { IncomingWebhook } = require('@slack/client');

/**
 * Send slack notification message for error messages, success or informations
 *
 * Pass a custom webhook URL
 * if you want it to isolate from the default channel that was provided in the .env file
 *
 * @param {string} message content body post message
 * @param {string} author name of the user / author
 * @param {string} title post message title
 * @param {string} msgFor slack notification for ['error', 'info', 'success']
 * @param {string} customWebhook custom slack url
 *
 * @return {string} status code
 */
function postNotificationToSlack (message, author, title, msgFor, customWebhook) {
    let url      = customWebhook || process.env.SLACK_WEB_HOOK_URL;
    let webhook  = new IncomingWebhook(url);
    const emojis = {
        success: {
            icon : ':smiley:',
            color: '#008952',
        },
        error: {
            icon : ':fearful:',
            color: '#ff0000',
        },
        info: {
            icon : ':warning:',
            color: '#2D9EE0',
        }
    };

    let iconEmoji       = emojis.success.icon;  // Default value if not appeared in emojis array
    let colorAttachment = emojis.success.color; // Default value if not appeared in emojis array
    if (emojis.hasOwnProperty(msgFor)) {
        iconEmoji       = emojis[msgFor].icon;
        colorAttachment = emojis[msgFor].color;
    }

    let options = {
        icon_emoji : iconEmoji,
        username   : author,
        attachments: [{
            color: colorAttachment,
            text : message,
            title: title
        }]
    };

    return new Promise((resolve, reject) => {
        webhook.send(options, (err, header, statusCode) => {
            (err) ? reject(err) : resolve(statusCode);
        });
    });
}


module.exports = {
    postNotificationToSlack,
};
