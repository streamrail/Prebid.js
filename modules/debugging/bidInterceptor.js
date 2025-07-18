import {BANNER, VIDEO} from '../../src/mediaTypes.js';
import {deepAccess, deepClone, delayExecution, hasNonSerializableProperty, mergeDeep} from '../../src/utils.js';
import responseResolvers from './responses.js';

/**
 * @typedef {Number|String|boolean|null|undefined} Scalar
 */

export function BidInterceptor(opts = {}) {
  ({setTimeout: this.setTimeout = window.setTimeout.bind(window)} = opts);
  this.logger = opts.logger;
  this.rules = [];
}

Object.assign(BidInterceptor.prototype, {
  DEFAULT_RULE_OPTIONS: {
    delay: 0
  },
  serializeConfig(ruleDefs) {
    const isSerializable = (ruleDef, i) => {
      const serializable = !hasNonSerializableProperty(ruleDef);
      if (!serializable && !deepAccess(ruleDef, 'options.suppressWarnings')) {
        this.logger.logWarn(`Bid interceptor rule definition #${i + 1} contains non-serializable properties and will be lost after a refresh. Rule definition: `, ruleDef);
      }
      return serializable;
    }
    return ruleDefs.filter(isSerializable);
  },
  updateConfig(config) {
    this.rules = (config.intercept || []).map((ruleDef, i) => this.rule(ruleDef, i + 1))
  },
  /**
   * @typedef {Object} RuleOptions
   * @property {Number} [delay=0] delay between bid interception and mocking of response (to simulate network delay)
   * @property {boolean} [suppressWarnings=false] if enabled, do not warn about unserializable rules
   *
   * @typedef {Object} Rule
   * @property {Number} no rule number (used only as an identifier for logging)
   * @property {function({}, {}): boolean} match a predicate function that tests a bid against this rule
   * @property {ReplacerFn} replacer generator function for mock bid responses
   * @property {RuleOptions} options
   */

  /**
   * @param {{}} ruleDef
   * @param {Number} ruleNo
   * @returns {Rule}
   */
  rule(ruleDef, ruleNo) {
    return {
      no: ruleNo,
      match: this.matcher(ruleDef.when, ruleNo),
      replace: this.replacer(ruleDef.then, ruleNo),
      options: Object.assign({}, this.DEFAULT_RULE_OPTIONS, ruleDef.options),
      paapi: this.paapiReplacer(ruleDef.paapi || [], ruleNo)
    }
  },
  /**
   * @typedef {Function} MatchPredicate
   * @param {*} candidate a bid to match, or a portion of it if used inside an ObjectMather.
   * e.g. matcher((bid, bidRequest) => ....) or matcher({property: (property, bidRequest) => ...})
   * @param {*} bidRequest the request `candidate` belongs to
   * @returns {boolean}
   *
   */

  /**
   * @param {*} matchDef matcher definition
   * @param {Number} ruleNo
   * @returns {MatchPredicate} a predicate function that matches a bid against the given `matchDef`
   */
  matcher(matchDef, ruleNo) {
    if (typeof matchDef === 'function') {
      return matchDef;
    }
    if (typeof matchDef !== 'object') {
      this.logger.logError(`Invalid 'when' definition for debug bid interceptor (in rule #${ruleNo})`);
      return () => false;
    }
    function matches(candidate, {ref = matchDef, args = []}) {
      return Object.entries(ref).map(([key, val]) => {
        const cVal = candidate[key];
        if (val instanceof RegExp) {
          return val.exec(cVal) != null;
        }
        if (typeof val === 'function') {
          return !!val(cVal, ...args);
        }
        if (typeof val === 'object') {
          return matches(cVal, {ref: val, args});
        }
        return cVal === val;
      }).every((i) => i);
    }
    return (candidate, ...args) => matches(candidate, {args});
  },
  /**
   * @typedef {Function} ReplacerFn
   * @param {*} bid a bid that was intercepted
   * @param {*} bidRequest the request `bid` belongs to
   * @returns {*} the response to mock for `bid`, or a portion of it if used inside an ObjectReplacer.
   * e.g. replacer((bid, bidRequest) => mockResponse) or replacer({property: (bid, bidRequest) => mockProperty})
   *
   */

  /**
   * @param {*} replDef replacer definition
   * @param ruleNo
   * @return {ReplacerFn}
   */
  replacer(replDef, ruleNo) {
    if (replDef === null) {
      return () => null
    }
    replDef = replDef || {};
    let replFn;
    if (typeof replDef === 'function') {
      replFn = ({args}) => replDef(...args);
    } else if (typeof replDef !== 'object') {
      this.logger.logError(`Invalid 'then' definition for debug bid interceptor (in rule #${ruleNo})`);
      replFn = () => ({});
    } else {
      replFn = ({args, ref = replDef}) => {
        const result = Array.isArray(ref) ? [] : {};
        Object.entries(ref).forEach(([key, val]) => {
          if (typeof val === 'function') {
            result[key] = val(...args);
          } else if (val != null && typeof val === 'object') {
            result[key] = replFn({args, ref: val})
          } else {
            result[key] = val;
          }
        });
        return result;
      }
    }
    return (bid, ...args) => {
      const response = this.responseDefaults(bid);
      mergeDeep(response, replFn({args: [bid, ...args]}));
      const resolver = responseResolvers[response.mediaType];
      resolver && resolver(bid, response);
      response.isDebug = true;
      return response;
    }
  },

  paapiReplacer(paapiDef, ruleNo) {
    function wrap(configs = []) {
      return configs.map(config => {
        return Object.keys(config).some(k => !['config', 'igb'].includes(k))
          ? {config}
          : config
      });
    }
    if (Array.isArray(paapiDef)) {
      return () => wrap(paapiDef);
    } else if (typeof paapiDef === 'function') {
      return (...args) => wrap(paapiDef(...args))
    } else {
      this.logger.logError(`Invalid 'paapi' definition for debug bid interceptor (in rule #${ruleNo})`);
    }
  },

  responseDefaults(bid) {
    const response = {
      requestId: bid.bidId,
      cpm: 3.5764,
      currency: 'EUR',
      ttl: 360,
      creativeId: 'mock-creative-id',
      netRevenue: false,
      meta: {}
    };

    if (!bid.mediaType) {
      response.mediaType = Object.keys(bid.mediaTypes ?? {})[0] ?? BANNER;
    }
    let size;
    if (response.mediaType === BANNER) {
      size = bid.mediaTypes?.banner?.sizes?.[0] ?? [300, 250];
    } else if (response.mediaType === VIDEO) {
      size = bid.mediaTypes?.video?.playerSize?.[0] ?? [600, 500];
    }
    if (Array.isArray(size)) {
      ([response.width, response.height] = size);
    }
    return response;
  },
  /**
   * Match a candidate bid against all registered rules.
   *
   * @param {{}} candidate
   * @param args
   * @returns {Rule|undefined} the first matching rule, or undefined if no match was found.
   */
  match(candidate, ...args) {
    return this.rules.find((rule) => rule.match(candidate, ...args));
  },
  /**
   * Match a set of bids against all registered rules.
   *
   * @param bids
   * @param bidRequest
   * @returns {[{bid: *, rule: Rule}[], *[]]} a 2-tuple for matching bids (decorated with the matching rule) and
   * non-matching bids.
   */
  matchAll(bids, bidRequest) {
    const [matches, remainder] = [[], []];
    bids.forEach((bid) => {
      const rule = this.match(bid, bidRequest);
      if (rule != null) {
        matches.push({rule: rule, bid: bid});
      } else {
        remainder.push(bid);
      }
    })
    return [matches, remainder];
  },
  /**
   * Run a set of bids against all registered rules, filter out those that match,
   * and generate mock responses for them.
   *
   * {{}[]} bids?
   * {*} bidRequest
   * {function(*)} addBid called once for each mock response
   * addPaapiConfig called once for each mock PAAPI config
   * {function()} done called once after all mock responses have been run through `addBid`
   * returns {{bids: {}[], bidRequest: {}} remaining bids that did not match any rule (this applies also to
   * bidRequest.bids)
   */
  intercept({bids, bidRequest, addBid, addPaapiConfig, done}) {
    if (bids == null) {
      bids = bidRequest.bids;
    }
    const [matches, remainder] = this.matchAll(bids, bidRequest);
    if (matches.length > 0) {
      const callDone = delayExecution(done, matches.length);
      matches.forEach((match) => {
        const mockResponse = match.rule.replace(match.bid, bidRequest);
        const mockPaapi = match.rule.paapi(match.bid, bidRequest);
        const delay = match.rule.options.delay;
        this.logger.logMessage(`Intercepted bid request (matching rule #${match.rule.no}), mocking response in ${delay}ms. Request, response, PAAPI configs:`, match.bid, mockResponse, mockPaapi)
        this.setTimeout(() => {
          mockResponse && addBid(mockResponse, match.bid);
          mockPaapi.forEach(cfg => addPaapiConfig(cfg, match.bid, bidRequest));
          callDone();
        }, delay)
      });
      bidRequest = deepClone(bidRequest);
      bids = bidRequest.bids = remainder;
    } else {
      this.setTimeout(done, 0);
    }
    return {bids, bidRequest};
  }
});
