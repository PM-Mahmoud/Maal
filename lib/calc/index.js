'use strict';

const { compoundGrowth } = require('./compoundGrowth');
const { loanAmortisation } = require('./loanAmortisation');
const { superProjection, ASFA_COMFORTABLE_SINGLE, ASFA_COMFORTABLE_COUPLE } = require('./superProjection');
const { monteCarlo } = require('./monteCarlo');

module.exports = {
  compoundGrowth,
  loanAmortisation,
  superProjection,
  monteCarlo,
  ASFA_COMFORTABLE_SINGLE,
  ASFA_COMFORTABLE_COUPLE,
};
