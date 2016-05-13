/**
 * config
 *
 */
'use strict';

const path = require('path');
const lodash = require('lodash');
const Promise = require('bluebird');
const fs = require('fs-extra-promise');

const tools = require('../lib/tools');

// default config
const defaultConfig = require('../config.default.json');

const config = {
    uuid: 0,
    defaultConfig: defaultConfig,
    getCurrentConfig: function() {
        let configPath = '../config.json';

        if(this.currentConfig) {
            return Promise.resolve(this.currentConfig);
        }

        return fs.existsAsync(configPath)
        .then(exists => {
            return exists ? fs.readFileAsync(configPath) : null;
        })
        .then(configBuf => {
            return JSON.parse(configBuf);
        })
        .then(config => {
            config = lodash.merge({}, this.defaultConfig, config);

            this.currentConfig = config;

            return config;
        });
    },
    create: function(cfg) {
        return this.getCurrentConfig()
        .then(currCfg => {
            return lodash.merge({}, currCfg, cfg);
        })
        .then(cfg => {
            let action = cfg.action || 'shot';

            // id
            if(!cfg.id) {
                cfg.id = [action, Date.now(), ++this.uuid].join('_');
            }

            // viewport
            let viewport = cfg.viewport;
            if(viewport && typeof viewport === 'string') {
                viewport = viewport.replace(/[\[\]]/, '').split(',');

                cfg.viewport = [
                    +viewport[0] || 1920,
                    +viewport[1] || 1200
                ];
            }

            return cfg;
        });
    },
    processContent: function(cfg) {
        if(cfg.out) {
            return Promise.resolve(cfg);
        }

        let imgExtMap = {
            'jpeg': '.jpg',
            'jpg': '.jpg',
            'png': '.png'
        };

        let imgExt = cfg.imageExtname;
        if(!imgExt) {
            imgExt = imgExtMap[cfg.imageType || 'png'];
        }

        // out config
        let cwd = '.';
        let outDir = cfg.id || 'tmp';
        let outName = cfg.name || 'out';

        let outPath = process.env.OUT_PATH;
        if(outPath.charAt(0) !== '/') {
            outPath = path.join(cwd, outPath);
        }
        outPath = path.join(outPath, outDir);

        cfg.out = {
            // name: '',
            path: outPath,
            dirname: outDir,
            html: path.join(outPath, outName + '.html'),
            image: path.join(outPath, outName + imgExt)
        };

        // content
        if(cfg.content) {
            let url = path.join(outPath, 'out.html');
            let htmlTplPath = path.join(cwd, 'tpl', cfg.htmlTpl);

            return fs.readFileAsync(htmlTplPath)
            .then(htmlTpl => {
                let content = tools.processHTML(cfg.content);
                let html = tools.fill(htmlTpl, {
                    content: content
                });

                return fs.outputFileAsync(url, html);
            })
            .then(() => {
                cfg.url = url;

                return cfg;
            });
        }

        return Promise.resolve(cfg);
    }
};

module.exports = config;