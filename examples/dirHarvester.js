"use strict";

var NexusHarvester = require('../src/NexusHarvester'),
    NexusClient = require('nexus-client-js'),

    path = require('path'),

    dirClient,
    dirHarvester;

dirClient = NexusClient.build(
    'http://localhost:5000',
    'THISISYOURKEY'
);

dirHarvester = new NexusHarvester(path.resolve(__dirname, './logs'), dirClient);

dirHarvester.watch();