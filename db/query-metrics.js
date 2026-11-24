'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

const enabled = process.env.NODE_ENV !== 'production' && process.env.MAAL_QUERY_METRICS === '1';
const requests = new AsyncLocalStorage();

function beginRequest(req, res, next) {
  const started = performance.now();
  const metric = { count: 0, inFlight: 0, peakInFlight: 0, queryMs: 0 };
  res.once('finish', () => {
    if (!metric.count) return;
    console.info('[db-metrics]', JSON.stringify({
      method: req.method,
      route: typeof req.route?.path === 'string' ? req.route.path : '(unmatched)',
      count: metric.count,
      peakInFlight: metric.peakInFlight,
      queryMs: Math.round(metric.queryMs),
      requestMs: Math.round(performance.now() - started),
    }));
  });
  return requests.run(metric, next);
}

function instrumentClient(Client) {
  return class TimedClient extends Client {
    query(...args) {
      const metric = requests.getStore();
      if (!metric) return super.query(...args);

      const started = performance.now();
      metric.count += 1;
      metric.inFlight += 1;
      metric.peakInFlight = Math.max(metric.peakInFlight, metric.inFlight);
      const finish = () => {
        metric.inFlight -= 1;
        metric.queryMs += performance.now() - started;
      };

      const last = args.length - 1;
      const callback = args[last];
      if (typeof callback === 'function') {
        args[last] = (...result) => {
          finish();
          return callback(...result);
        };
      }

      try {
        const result = super.query(...args);
        return typeof callback === 'function' ? result : Promise.resolve(result).finally(finish);
      } catch (error) {
        finish();
        throw error;
      }
    }
  };
}

module.exports = { enabled, beginRequest, instrumentClient };
