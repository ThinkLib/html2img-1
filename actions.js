/**
 * hlg-html2img
 *
 * actions
 */
'use strict';

// deps
var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var lodash = require('lodash');
var Promise = require('bluebird');

var tools = require('./lib/tools');
var Horseman = require('./lib/horseman');
var processers = require('./lib/processers');

var horseman = null;
var actions = {
    // init
    init: function() {
        if(horseman) {
            return horseman.ready;
        }

        // init Horseman (phantomjs)
        tools.log('Actions.init');

        horseman = new Horseman({
            Referer: process.env.REQUEST_REFERER
        });

        // processers
        processers.init({
            horseman: horseman
        });

        // error
        horseman.on('error', function(msg, trace) {
            tools.error('Horseman Error:', msg, trace);

            process.exit(1);
        });

        return horseman.ready.then(function() {
            // page, phantomjs page
            var page = horseman.page;

            // debug
            page.onConsoleMessage = function() {
                var args = lodash.toArray(arguments);
                args.unshift('Actions.page.console');

                tools.log.apply(tools, args);
            };

            // ready
            tools.log('Actions.init.done');
        });
    },
    // invoke
    invoke: function(action, config, client) {
        if(!this[action]) {
            return Promise.reject(new Error('No action defined'));
        }

        return this[action](config, client);
    },
    // config
    processConfig: function(config) {
        if(config.out) {
            return config;
        }

        var cwd = __dirname;
        var imgExtMap = {
            'jpeg': '.jpg',
            'jpg': '.jpg',
            'png': '.png'
        };
        var imgExt = config.imageExtname;
        if(!imgExt) {
            imgExt = imgExtMap[config.imageType || 'png'];
        }

        // out config
        var outDir = config.id || 'tmp';
        var outName = config.name || 'out';
        var outPath = path.join(process.env.OUT_PATH, outDir);
        if(outPath.slice(0, 1) !== '/') {
            outPath = path.join(cwd, outPath);
        }

        // mkdir
        tools.mkDeepDir(outPath);

        config.out = {
            name: '',
            path: outPath,
            dirname: outDir,
            html: path.join(outPath, outName + '.html'),
            image: path.join(outPath, outName + imgExt)
        };

        // content
        if(config.content) {
            var inPath = path.join(outPath, 'in.html');
            console.log('xxx', config.htmlTpl);
            var htmlTplPath = path.join(cwd, 'tpl', config.htmlTpl);
            var htmlTpl = fs.readFileSync(htmlTplPath);

            var content = tools.processHTML(config.content);
            var html = tools.fill(htmlTpl, {
                content: content,
                cwd: cwd
            });

            fs.writeFileSync(inPath, html);

            config.url = inPath;
        }

        return config;
    },
    // 清理目录
    clean: function(client, config, callback) {
        // config
        this.processConfig(config);

        tools.log('Actions.clean');

        var url = config.path || config.out.path;
        var type = 'clean_result';

        tools.log('Actions.clean', url);

        if(!fs.existsSync(url)) {
            var msg = 'No such file or directory, ' + url;
            var err = new Error(msg);

            return callback(err, type, -1);
        }

        rimraf(url, function(err) {
            var code = 0;
            if(err) {
                code = -2;
            }

            tools.log('Actions.clean.done');

            callback(err, type, code);
        });
    },
    // 取文件
    getfile: function(client, config, callback) {
        // config
        this.processConfig(config);

        tools.log('Actions.getfile');

        var url = config.url;
        if(!url) {
            url = config.out.image;
        }

        if(!fs.existsSync(url)) {
            var msg = 'No such file or directory, ' + url;
            return callback(new Error(msg));
        }

        fs.readFile(url, function(err, buf) {
            if(err) {
                callback(err);
                return;
            }

            tools.log('Actions.getfile.done');

            callback(null, 'file', buf);
        });
    },
    // 压缩图片
    optimizeImage: function(ret, config) {
        if(!config || !config.optimizeImage) {
            return ret;
        }

        return processers.optimizeImage({
            image: ret.image
        })
        .then(function(newImage) {
            ret.full_image = ret.image;
            ret.image = newImage;

            return ret;
        });
    },
    // 缩略图
    makeshot: function(config) {
        var self = this;

        // config
        this.processConfig(config);

        return processers.makeshot(config)
        // optimizeImage
        .then(function(ret) {
            return self.optimizeImage(ret, config);
        })
        // fit data
        .then(function(ret) {
            // 兼容旧接口
            ret.outFile = ret.image;

            return ret;
        });
    },
    // 新关联列表（待完善）
    makelist: function(client, config, callback) {
        var self = this;

        // config
        this.processConfig(config);

        return processers.makelist(config)
        // optimizeImage
        .then(function(res) {
            return self.optimizeImage(res, config);
        })
        // fit data
        .then(function(res) {
            var data = {
                status: 'success',
                message: '',
                data: res
            };

            callback(null, 'makelist_result', data);
        })
        .catch(function(err) {
            callback(err);
        });
    }
};


// clean horseman
process.on('exit', function() {
    if(horseman) {
        horseman.close();
    }
});

// error catch
process.on('uncaughtException', function(err) {
    if(horseman) {
        horseman.close();
    }

    console.error('Actions uncaughtException', err);
    throw err;
});


actions.init();

module.exports = actions;
