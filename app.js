/**
 * html2img
 *
 * app
 */
'use strict';

// env
require('dotenv-safe').load();

// logger
const logger = require('./services/logger');

// Controllers
const controllerFactory = require('./controllers/index');

// koa
const koa = require('koa');
const onerror = require('koa-onerror');
const favicon = require('koa-favicon');
const bodyParser = require('koa-bodyparser');

// init app, whit proxy
const app = koa();
app.proxy = true;

// request body
app.use(bodyParser());

// 404
app.use(function *(next) {
    yield* next;

    if(this.status === 404 && !this.body) {
        this.throw(404);
    }
});

// Controllers
app.use(controllerFactory(app));

// favicon
// maxAge, 1 month
app.use(favicon('./static/favicon.ico', {
    maxAge: 30 * 24 * 60 * 60 * 1000
}));


// Error handle
onerror(app, {
    accepts: function() {
        return 'json';
    },
    all: function(err) {
        let data = err.data || {};
        let statusCode = err.status;

        // Boom error
        if(err.output) {
            statusCode = err.output.statusCode;
        }

        data.status = statusCode || 500;
        if(!data.message) {
            data.message = err.message;
        }

        if(app.env === 'development') {
            data.stack = err.stack.split('\n');
        }

        this.status = data.status;
        this.body = data;
    }
});

// Error report
app.on('error', err => {
    logger.info('[App Error]', err.message);
    logger.error(err);
});

// process.crash
process.on('uncaughtException', ex => {
    logger.info('[App Crashed]', ex.message);
    logger.error(ex);

    process.exit(1);
});


// start up
if(!module.parent) {
    let port = process.env.PORT || 3007;
    app.listen(port);

    logger.info('Server listening: ' + port);
}

// exports
module.exports = app;