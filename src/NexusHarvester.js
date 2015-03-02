"use strict";

var NexusHarvester,

    ensure = require('ensure.js'),
    shield = ensure.shield,
    winston = require('winston'),
    watch = require('watch'),
    path = require('path'),
    fs = require('fs'),
    Nothing = ensure.Nothing,
    NexusClient = require('nexus-client-js');

NexusHarvester = function (logPath, client) {
    var self = this;

    winston.info('Initializing a new log harvester');

    this.path = logPath;
    this.client = client;

    this.everyLines = 10;
    this.everySeconds = 10;

    this.linesCollection = {};

    this.keepAlive = function () {
        winston.info('ALIVE');

        if (self.push) {
            self.push(null, null);
        }

        setTimeout(self.keepAlive, 10000);
    };

    this.readNewLines = function (filePath, currPos, prevPos) {
        if (currPos <= prevPos) {
            return;
        }

        var readStream = fs.createReadStream(filePath, {
            encoding: 'utf8',
            start: prevPos,
            end: currPos
        });

        readStream.on('data', function (data) {
            var lines = data.split("\n");

            // Only use lines that actually have characters
            lines = lines.filter(function (line) {
                return (line.length > 1);
            });

            self.push(path.basename(filePath), lines);
        })
    };
};

NexusHarvester.prototype.watch = function () {
    fs.readdir(this.path, function (err, files) {
        if (files) {
            files.forEach(function (filename) {
                this.watchFile(path.resolve(this.path, filename));
            }.bind(this))
        }
    }.bind(this));

    watch.createMonitor(this.path, function (monitor) {
        monitor.on('created', function (filePath, stat) {
            winston.info('ADDED: ' + filePath);

            this.watchFile(filePath);
        }.bind(this));

        monitor.on('removed', function (filePath, stat) {
            winston.info('REMOVED: ' + filePath);
        });
    }.bind(this));

    this.keepAlive();
};

NexusHarvester.prototype.watchFile = function (filePath) {
    winston.info('WATCHING: ' + filePath);

    var currentSize = fs.statSync(filePath).size,
        watcher = fs.watch(filePath, function (event, filename) {
            if (event === 'rename') {
                winston.info('RENAMED: ' + filePath);

                fs.stat(filePath, function (err, stat) {
                    this.readNewLines(filePath, stat.size, currentSize);
                }.bind(this));
            } else if (event === 'change') {
                winston.info('CHANGE: ' + filePath);

                fs.stat(filePath, function (err, stat) {
                    this.readNewLines(filePath, stat.size, currentSize);

                    currentSize = stat.size;
                }.bind(this));
            }
        }.bind(this));
};

NexusHarvester.prototype.push = function (filename, lines) {
    var needsPush = false,
        key;

    // Add lines if provided
    if (filename && lines) {
        // Check if array exists in collection
        if (this.linesCollection[filename]) {
            this.linesCollection[filename] = this.linesCollection[filename].concat(lines);
        } else {
            this.linesCollection[filename] = lines;
        }
    } else {
        needsPush = true;
    }

    // Check if any log needs to be pushed
    if (Object.keys(this.linesCollection).length > 0 && needsPush === false) {
        for (key in this.linesCollection) {
            if (this.linesCollection[key].length > this.everyLines) {
                needsPush = true;
            }
        }
    }

    if (needsPush) {
        for (key in this.linesCollection) {
            winston.info('PUSHING: ' + key);

            // Remove newline chars
            this.linesCollection[key] = this.linesCollection[key].map(function (line) {
                var newline = line.trim().replace(/\n/, '');

                return newline;
            });

            winston.info('----');
            this.linesCollection[key].forEach(function (line) {
                winston.info(line);
            });
            winston.info('----');


            this.client.log(key, this.linesCollection[key]);

            this.linesCollection[key] = null;
            delete this.linesCollection[key];
        }
    }
};

module.exports = NexusHarvester;
