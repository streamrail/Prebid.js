import { logWarn, isArray, isFn, deepAccess, isEmpty, contains, timestamp, getBidIdParameter } from '../src/utils.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import {BANNER, VIDEO} from '../src/mediaTypes.js';
import {config} from '../src/config.js';

const SUPPORTED_AD_TYPES = [BANNER, VIDEO];
const BIDDER_CODE = 'rise';
const ADAPTER_VERSION = '6.0.0';
const TTL = 360;
const CURRENCY = 'USD';
const SELLER_ENDPOINT = 'https://hb.yellowblue.io/';
const MODES = {
  PRODUCTION: 'hb-multi',
  TEST: 'hb-multi-test'
}
const SUPPORTED_SYNC_METHODS = {
  IFRAME: 'iframe',
  PIXEL: 'pixel'
}

export const spec = {
  code: BIDDER_CODE,
  gvlid: 1043,
  version: ADAPTER_VERSION,
  supportedMediaTypes: SUPPORTED_AD_TYPES,
  isBidRequestValid: function(bidRequest) {
    if (!bidRequest.params) {
      logWarn('no params have been set to Rise adapter');
      return false;
    }

    if (!bidRequest.params.org) {
      logWarn('org is a mandatory param for Rise adapter');
      return false;
    }

    return true;
  },
  buildRequests: function (validBidRequests, bidderRequest) {
    const combinedRequestsObject = {};

    // use data from the first bid, to create the general params for all bids
    const generalObject = validBidRequests[0];
    const testMode = generalObject.params.testMode;

    combinedRequestsObject.params = generateGeneralParams(generalObject, bidderRequest);
    combinedRequestsObject.bids = generateBidsParams(validBidRequests, bidderRequest);

    return {
      method: 'POST',
      url: getEndpoint(testMode),
      data: combinedRequestsObject
    }
  },
  interpretResponse: function({body}) {
    const bidResponses = [];

    if (body.bids) {
      body.bids.forEach(adUnit => {
        const bidResponse = {
          requestId: adUnit.requestId,
          cpm: adUnit.cpm,
          currency: body.params.currency,
          width: adUnit.width,
          height: adUnit.height,
          ttl: adUnit.ttl || TTL,
          creativeId: adUnit.requestId,
          netRevenue: body.params.netRevenue,
          meta: {
            mediaType: adUnit.mediaType
          }
        };

        if (adUnit.mediaType === VIDEO) {
          bidResponse.vastXml = adUnit.vastXml;
        } else if (adUnit.mediaType === BANNER) {
          bidResponse.ad = adUnit.ad;
        }

        if (adUnit.adomain && adUnit.adomain.length) {
          bidResponse.meta.advertiserDomains = adUnit.adomain;
        }

        bidResponses.push(bidResponse);
      });
    }

    return bidResponses;
  },
  getUserSyncs: function(syncOptions, serverResponses) {
    const syncs = [];
    for (const response of serverResponses) {
      if (syncOptions.iframeEnabled && response.body.params.userSyncURL) {
        syncs.push({
          type: 'iframe',
          // TODO: verify url is correct
          url: response.body.params.userSyncURL
        });
      }
      if (syncOptions.pixelEnabled && isArray(response.body.params.userSyncPixels)) {
        // TODO: verify pixels is correct
        const pixels = response.body.params.userSyncPixels.map(pixel => {
          return {
            type: 'image',
            url: pixel
          }
        })
        syncs.push(...pixels)
      }
    }
    return syncs;
  }
};

registerBidder(spec);

/**
 * Get floor price
 * @param bid {bid}
 * @returns {Number}
 */
function getFloor(bid, mediaType) {
  if (!isFn(bid.getFloor)) {
    return 0;
  }
  let floorResult = bid.getFloor({
    currency: CURRENCY,
    mediaType: mediaType,
    size: '*'
  });
  return floorResult.currency === CURRENCY && floorResult.floor ? floorResult.floor : 0;
}

/**
 * Get the the ad sizes array from the bid
 * @param bid {bid}
 * @returns {Array}
 */
function getSizesArray(bid, mediaType) {
  let sizesArray = []

  if (deepAccess(bid, `mediaTypes.${mediaType}.sizes`)) {
    sizesArray = bid.mediaTypes[mediaType].sizes;
  } else if (Array.isArray(bid.sizes) && bid.sizes.length) {
    sizesArray = bid.sizes;
  }

  return sizesArray;
}

/**
 * Get schain string value
 * @param schainObject {Object}
 * @returns {string}
 */
function getSupplyChain(schainObject) {
  if (isEmpty(schainObject)) {
    return '';
  }
  let scStr = `${schainObject.ver},${schainObject.complete}`;
  schainObject.nodes.forEach((node) => {
    scStr += '!';
    scStr += `${getEncodedValIfNotEmpty(node.asi)},`;
    scStr += `${getEncodedValIfNotEmpty(node.sid)},`;
    scStr += `${node.hp ? encodeURIComponent(node.hp) : ''},`;
    scStr += `${getEncodedValIfNotEmpty(node.rid)},`;
    scStr += `${getEncodedValIfNotEmpty(node.name)},`;
    scStr += `${getEncodedValIfNotEmpty(node.domain)}`;
  });
  return scStr;
}

/**
 * Get encoded node value
 * @param val {string}
 * @returns {string}
 */
function getEncodedValIfNotEmpty(val) {
  return !isEmpty(val) ? encodeURIComponent(val) : '';
}

/**
 * Get preferred user-sync method based on publisher configuration
 * @param bidderCode {string}
 * @returns {string}
 */
function getAllowedSyncMethod(filterSettings, bidderCode) {
  const iframeConfigsToCheck = ['all', 'iframe'];
  const pixelConfigToCheck = 'image';
  if (filterSettings && iframeConfigsToCheck.some(config => isSyncMethodAllowed(filterSettings[config], bidderCode))) {
    return SUPPORTED_SYNC_METHODS.IFRAME;
  }
  if (!filterSettings || !filterSettings[pixelConfigToCheck] || isSyncMethodAllowed(filterSettings[pixelConfigToCheck], bidderCode)) {
    return SUPPORTED_SYNC_METHODS.PIXEL;
  }
}

/**
 * Check if sync rule is supported
 * @param syncRule {Object}
 * @param bidderCode {string}
 * @returns {boolean}
 */
function isSyncMethodAllowed(syncRule, bidderCode) {
  if (!syncRule) {
    return false;
  }
  const isInclude = syncRule.filter === 'include';
  const bidders = isArray(syncRule.bidders) ? syncRule.bidders : [bidderCode];
  return isInclude && contains(bidders, bidderCode);
}

/**
 * Get the seller endpoint
 * @param testMode {boolean}
 * @returns {string}
 */
function getEndpoint(testMode) {
  return testMode
    ? SELLER_ENDPOINT + MODES.TEST
    : SELLER_ENDPOINT + MODES.PRODUCTION;
}

/**
 * get device type
 * @param uad {ua}
 * @returns {string}
 */
function getDeviceType(ua) {
  if (/ipad|android 3.0|xoom|sch-i800|playbook|tablet|kindle/i
    .test(ua.toLowerCase())) {
    return '5';
  }
  if (/iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i
    .test(ua.toLowerCase())) {
    return '4';
  }
  if (/smart[-_\s]?tv|hbbtv|appletv|googletv|hdmi|netcast|viera|nettv|roku|\bdtv\b|sonydtv|inettvbrowser|\btv\b/i
    .test(ua.toLowerCase())) {
    return '3';
  }
  return '1';
}

function generateBidsParams(validBidRequests, bidderRequest) {
  const bidsArray = [];

  if (validBidRequests.length) {
    validBidRequests.forEach(bid => {
      bidsArray.push(generateBidParameters(bid, bidderRequest));
    });
  }

  return bidsArray;
}

/**
 * Generate bid specific parameters
 * @param {bid} bid
 * @param {bidderRequest} bidderRequest
 * @returns {Object} bid specific params object
 */
function generateBidParameters(bid, bidderRequest) {
  const {params} = bid;
  const mediaType = isBanner(bid) ? BANNER : VIDEO;
  const timeout = config.getConfig('bidderTimeout');
  const sizesArray = getSizesArray(bid, mediaType);

  const bidObject = {
    mediaType,
    ad_unit_code: getBidIdParameter('adUnitCode', bid),
    tmax: timeout,
    sizes: sizesArray,
    floor_price: Math.max(getFloor(bid, mediaType), params.floorPrice),
    bid_id: getBidIdParameter('bidId', bid),
    bidder_request_id: getBidIdParameter('bidderRequestId', bid),
    transaction_id: getBidIdParameter('transactionId', bid),
  };

  // fix floor price in case of NAN
  if (isNaN(bidObject.floor_price)) {
    bidObject.floor_price = 0;
  }

  const pos = deepAccess(bid, `mediaTypes.${mediaType}.pos`);
  if (pos) {
    bidObject.pos = pos;
  }

  if (mediaType === VIDEO) {
    const playbackMethod = deepAccess(bid, `mediaTypes.video.playbackmethod`);
    if (playbackMethod) {
      bidObject.playback_method = playbackMethod;
    }

    const placement = deepAccess(bid, `mediaTypes.video.placement`);
    if (placement) {
      bidObject.placement = placement;
    }

    const minDuration = deepAccess(bid, `mediaTypes.video.minduration`);
    if (minDuration) {
      bidObject.min_duration = minDuration;
    }

    const maxDuration = deepAccess(bid, `mediaTypes.video.maxduration`);
    if (maxDuration) {
      bidObject.max_duration = maxDuration;
    }

    const skip = deepAccess(bid, `mediaTypes.video.skip`);
    if (skip) {
      bidObject.skip = skip;
    }

    const linearity = deepAccess(bid, `mediaTypes.video.linearity`);
    if (linearity) {
      bidObject.linearity = linearity;
    }
  }

  return bidObject;
}

function isBanner(bid) {
  return bid.mediaTypes && bid.mediaTypes.banner;
}

/**
 * Generate params that are common between all bids
 * @param {single bid object} generalObject
 * @param {bidderRequest} bidderRequest
 * @returns {object} the common params object
 */
function generateGeneralParams(generalObject, bidderRequest) {
  const domain = window.location.hostname;
  const {syncEnabled, filterSettings} = config.getConfig('userSync') || {};
  const {bidderCode} = bidderRequest;
  const generalBidParams = generalObject.params;

  const generalParams = {
    wrapper_type: 'prebidjs',
    wrapper_vendor: '$$PREBID_GLOBAL$$',
    wrapper_version: '$prebid.version$',
    adapter_version: ADAPTER_VERSION,
    auction_start: timestamp(),
    publisher_id: generalBidParams.org,
    publisher_name: domain,
    site_domain: domain,
    dnt: (navigator.doNotTrack == 'yes' || navigator.doNotTrack == '1' || navigator.msDoNotTrack == '1') ? 1 : 0,
    device_type: getDeviceType(navigator.userAgent),
    ua: navigator.userAgent,
    session_id: getBidIdParameter('auctionId', generalObject),
  }

  const userIdsParam = getBidIdParameter('userId', generalObject);
  if (userIdsParam) {
    generalParams.userIds = JSON.stringify(userIdsParam);
  }

  const ortb2Metadata = config.getConfig('ortb2') || {};
  if (ortb2Metadata.site) {
    generalParams.site_metadata = JSON.stringify(ortb2Metadata.site);
  }
  if (ortb2Metadata.user) {
    generalParams.user_metadata = JSON.stringify(ortb2Metadata.user);
  }

  const placementId = generalBidParams.placementId || deepAccess(generalObject, 'mediaTypes.banner.name');
  if (placementId) {
    generalParams.placement_id = placementId;
  }

  if (syncEnabled) {
    const allowedSyncMethod = getAllowedSyncMethod(filterSettings, bidderCode);
    if (allowedSyncMethod) {
      generalParams.cs_method = allowedSyncMethod;
    }
  }

  if (bidderRequest.uspConsent) {
    generalParams.us_privacy = bidderRequest.uspConsent;
  }

  if (bidderRequest && bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies) {
    generalParams.gdpr = bidderRequest.gdprConsent.gdprApplies;
    generalParams.gdpr_consent = bidderRequest.gdprConsent.consentString;
  }

  if (generalBidParams.ifa) {
    generalParams.ifa = generalBidParams.ifa;
  }

  if (generalObject.schain) {
    generalParams.schain = getSupplyChain(generalObject.schain);
  }

  if (bidderRequest && bidderRequest.refererInfo) {
    generalParams.referrer = deepAccess(bidderRequest, 'refererInfo.referer');
    generalParams.page_url = config.getConfig('pageUrl') || deepAccess(window, 'location.href');
  }

  return generalParams
}
