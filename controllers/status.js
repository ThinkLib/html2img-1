/**
 * controllers/status
 *
 */
'use strict';

const path = require('path');
const bytes = require('bytes');
const Promise = require('bluebird');
const fs = require('fs-extra-promise');
const pidstat = Promise.promisify(require('pidusage').stat);

const makeshot = require('../actions/makeshot');
const STATUS_PATH = process.env.STATUS_PATH;

module.exports = function(router) {
    let selfStartTime = Date.now();

    let prettyDate = function(ms) {
        let date = new Date(ms);

        let ret = [
            date.getFullYear() + '-',
            (date.getMonth() + 1) + '-',
            date.getDate() + ' ',
            date.getHours() + ':',
            date.getMinutes() + ':',
            date.getSeconds()
        ]
        .join('');

        return ret.replace(/\-(\d)\b/g, '-0$1');
    };

    router.get('/status', function *() {
        let rStatusFilename = /^\d+\.json$/;

        let status = {
            startTime: selfStartTime,
            startTimePretty: prettyDate(selfStartTime),
            uptime: Date.now() - selfStartTime,
            totalMemory: bytes(0),
            workersCount: 0,
            workers: [],
        };

        // check dir exists
        let appInited = yield fs.existsAsync(STATUS_PATH);
        if(!appInited) {
            this.body = status;

            return;
        }

        yield fs.readdirAsync(STATUS_PATH)
        .filter(filename => {
            return rStatusFilename.test(filename);
        })
        .map(filename => {
            let filepath = path.join(STATUS_PATH, filename);

            return fs.readJSONAsync(filepath)
            .then(status => {
                status.filename = filename;

                return status;
            });
        })
        // 过滤已关闭进程
        .filter(status => {
            if(!status.pid) {
                return false;
            }

            return pidstat(status.pid)
            .then(() => {
                return true;
            })
            .catch(() => {
                // 删除已废弃进程 status
                let filepath = path.join(STATUS_PATH, status.filename);
                fs.removeAsync(filepath);

                return false;
            });
        })
        .then(allStatus => {
            let totalMemory = 0;
            let startTime = selfStartTime;

            allStatus.forEach(status => {
                if(status.startTime < startTime) {
                    startTime = status.startTime;
                }

                let memory = status.phantomStat.memory;

                // pretty mem
                status.phantomStat.memoryPretty = bytes(memory);

                // total mem
                totalMemory += memory;
            });

            // startTime & Pretty
            status.startTime = startTime;
            status.startTimePretty = prettyDate(startTime);

            // uptime
            status.uptime = Date.now() - startTime;

            // totalMemory
            status.totalMemory = bytes(totalMemory);

            // workers
            status.workersCount = allStatus.length;
            status.workers = allStatus;
        });

        this.body = status;
    });
};