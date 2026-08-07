'use strict';

const { createProviderImportHandler } = require('./provider-import-job');
const { syncLunchFlow } = require('./lunchflow-sync');

module.exports = { lunchflowImportHandler: createProviderImportHandler({ provider: 'lunchflow', sync: syncLunchFlow }) };
