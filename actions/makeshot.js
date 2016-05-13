/**
 * actions/makeshot
 *
 */
'use strict';

const lodash = require('lodash');
const Promise = require('bluebird');

const phantom = require('../lib/phantom');
const logger = require('../services/logger');
const config = require('../services/config');

// counts
makeshot.counts = {
    total: 0,
    success: 0,
    error: 0
};

function makeshot(cfg, hooks) {
    logger.info('Actions.makeshot['+ cfg.action +']');

    let page;

    // hooks
    hooks = lodash.assign({
        beforeCheck: lodash.noop,
        beforeOptimize: lodash.noop,
        beforeShot: lodash.noop,
        afterShot: lodash.noop
    }, hooks);

    return config.processContent(cfg)
    .then(cfg => {
        if(!cfg.url) {
            throw new Error('url not provided');
        }

        return phantom.preparePage(cfg);
    })
    // cache page
    .tap(phPage => {
        page = phPage;
    })
    // hooks.beforeCheck
    .tap(() => {
        return hooks.beforeCheck(page, cfg);
    })
    // check wrap count
    .then(() => {
        let dfd = {};
        let interval = 160;
        let start = Date.now();
        let ttl = cfg.wrapFindTimeout;
        let selector = cfg.wrapSelector;
        let minCount = cfg.wrapMinCount;

        function check() {
            return page.evaluate(function(selector) {
                var $ = window.jQuery;
                // var shotTools = window.shotTools;
                // console.log('jQuery:', !!$ ? $.fn.jquery : null);
                // console.log('shotTools', !!shotTools ? shotTools.version : null);

                return $(selector).length;
            }, selector)
            .then(count => {
                if(!count || count < minCount) {
                    let errMsg = 'Wrap element not found: ' + selector;

                    return Promise.reject(new Error(errMsg));
                }

                return Promise.resolve();
            })
            .then(() => {
                dfd.resolve();
            }, err => {
                let now = Date.now();
                if(now - start <= ttl) {
                    setTimeout(check, interval);
                    return;
                }

                dfd.reject(err);
            });
        }

        setTimeout(check, interval);

        return new Promise((resolve, reject) => {
            dfd.resolve = resolve;
            dfd.reject = reject;
        });
    })
    .then(() => {
        let selector = cfg.wrapSelector;

        return page.getCropRects(selector, {
            maxCount: cfg.wrapMaxCount
        });
    })
    // hooks.beforeShot
    .tap(() => {
        return hooks.beforeShot(page, cfg);
    })
    // 给渲染一个喘息的机会，体谅下 phantomjs 的渲染性能
    .delay(+cfg.renderDelay || 0)
    // map rect & crop (Series)
    .then(rects => {
        let out = cfg.out;
        let imagePath = out.image;
        let images = out.images = [];
        let rExt = /(\.\w+)$/;

        return Promise.mapSeries(rects, (rect, inx) => {
            let path = imagePath;
            if(inx > 0) {
                path = path.replace(rExt, '-'+ (inx+1) +'$1');
            }

            images[inx] = path;

            return page.crop(rect, path);
        });
    })
    // hooks.beforeOptimize
    .tap(() => {
        return hooks.beforeOptimize(page, cfg);
    })
    // hooks.afterShot
    .tap(() => {
        return hooks.afterShot(cfg);
    })
    // clean
    .finally(() => {
        return page.release();
    })
    // result & count
    .then(() => {
        logger.info('Actions.makeshot['+ cfg.action +'].done');

        makeshot.counts.total += 1;
        makeshot.counts.success += 1;

        return cfg.out;
    }, ex => {
        makeshot.counts.total += 1;
        makeshot.counts.error += 1;

        return Promise.reject(ex);
    });

};

module.exports = makeshot;