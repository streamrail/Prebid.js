import { expect } from 'chai';
import { spec } from 'modules/riseBidAdapter.js';
import { newBidder } from 'src/adapters/bidderFactory.js';
import { config } from 'src/config.js';
import { VIDEO } from '../../../src/mediaTypes.js';
import { deepClone } from 'src/utils.js';

const ENDPOINT = 'https://hb.yellowblue.io/hb-multi';
const TEST_ENDPOINT = 'https://hb.yellowblue.io/hb-multi-test';
const TTL = 360;
/* eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */

describe('riseAdapter', function () {
  const adapter = newBidder(spec);

  describe('inherited functions', function () {
    it('exists and is a function', function () {
      expect(adapter.callBids).to.exist.and.to.be.a('function');
    });
  });

  describe('isBidRequestValid', function () {
    const bid = {
      'bidder': spec.code,
      'adUnitCode': 'adunit-code',
      'sizes': [['640', '480']],
      'params': {
        'org': 'jdye8weeyirk00000001'
      }
    };

    it('should return true when required params are passed', function () {
      expect(spec.isBidRequestValid(bid)).to.equal(true);
    });

    it('should return false when required params are not found', function () {
      const newBid = Object.assign({}, bid);
      delete newBid.params;
      newBid.params = {
        'org': null
      };
      expect(spec.isBidRequestValid(newBid)).to.equal(false);
    });
  });

  describe('buildRequests', function () {
    const bidRequests = [
      {
        'bidder': spec.code,
        'adUnitCode': 'adunit-code',
        'sizes': [[640, 480]],
        'params': {
          'org': 'jdye8weeyirk00000001'
        },
        'bidId': '299ffc8cca0b87',
        'bidderRequestId': '1144f487e563f9',
        'auctionId': 'bfc420c3-8577-4568-9766-a8a935fb620d',
      }
    ];

    const testModeBidRequests = [
      {
        'bidder': spec.code,
        'adUnitCode': 'adunit-code',
        'sizes': [[640, 480]],
        'params': {
          'org': 'jdye8weeyirk00000001',
          'testMode': true
        },
        'bidId': '299ffc8cca0b87',
        'bidderRequestId': '1144f487e563f9',
        'auctionId': 'bfc420c3-8577-4568-9766-a8a935fb620d',
      }
    ];

    const bidderRequest = {
      bidderCode: 'rise',
    }
    const placementId = '12345678';

    it('sends the placementId as a query param', function () {
      bidRequests[0].params.placementId = placementId;
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.params.placement_id).to.equal(placementId);
    });

    it('sends bid request to ENDPOINT via POST', function () {
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.url).to.equal(ENDPOINT);
      expect(request.method).to.equal('POST');
    });

    it('sends bid request to TEST ENDPOINT via POST', function () {
      const request = spec.buildRequests(testModeBidRequests, bidderRequest);
      expect(request.url).to.equal(TEST_ENDPOINT);
      expect(request.method).to.equal('POST');
    });

    it('should send the correct bid Id', function () {
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.bids[0].bid_id).to.equal('299ffc8cca0b87');
    });

    it('should send the correct sizes array', function () {
      const request = spec.buildRequests(bidRequests, bidderRequest);
      // TODO: verify sizes for multiple bids in array using loop
      expect(request.data.bids[0].sizes).to.be.an('array');
      expect(request.data.bids[0].sizes).to.equal(bidRequests[0].sizes)
    });

    it('should respect syncEnabled option', function() {
      config.setConfig({
        userSync: {
          syncEnabled: false,
          filterSettings: {
            all: {
              bidders: '*',
              filter: 'include'
            }
          }
        }
      });
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.not.have.property('cs_method');
    });

    it('should respect "iframe" filter settings', function () {
      config.setConfig({
        userSync: {
          syncEnabled: true,
          filterSettings: {
            iframe: {
              bidders: [spec.code],
              filter: 'include'
            }
          }
        }
      });
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.have.property('cs_method', 'iframe');
    });

    it('should respect "all" filter settings', function () {
      config.setConfig({
        userSync: {
          syncEnabled: true,
          filterSettings: {
            all: {
              bidders: [spec.code],
              filter: 'include'
            }
          }
        }
      });
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.have.property('cs_method', 'iframe');
    });

    // it('should send the pixel user sync param if userSync is enabled and no "iframe" or "all" configs are present', function () {
    //   config.setConfig({
    //     userSync: {
    //       syncEnabled: true
    //     }
    //   });
    //   const request = spec.buildRequests(bidRequests, bidderRequest);
    //   console.log(request.data.params);
    //   expect(request.data.params).to.be.an('object');
    //   expect(request.data.params).to.have.property('cs_method', 'pixel');
    // });

    it('should respect total exclusion', function() {
      config.setConfig({
        userSync: {
          syncEnabled: true,
          filterSettings: {
            image: {
              bidders: [spec.code],
              filter: 'exclude'
            },
            iframe: {
              bidders: [spec.code],
              filter: 'exclude'
            }
          }
        }
      });
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.not.have.property('cs_method');
    });

    it('should have us_privacy param if usPrivacy is available in the bidRequest', function () {
      const bidderRequestWithUSP = Object.assign({uspConsent: '1YNN'}, bidderRequest);
      const request = spec.buildRequests(bidRequests, bidderRequestWithUSP);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.have.property('us_privacy', '1YNN');
    });

    it('should have an empty us_privacy param if usPrivacy is missing in the bidRequest', function () {
      const request = spec.buildRequests(bidRequests, bidderRequest);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.not.have.property('us_privacy');
    });

    it('should not send the gdpr param if gdprApplies is false in the bidRequest', function () {
      const bidderRequestWithGDPR = Object.assign({gdprConsent: {gdprApplies: false}}, bidderRequest);
      const request = spec.buildRequests(bidRequests, bidderRequestWithGDPR);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.not.have.property('gdpr');
      expect(request.data.params).to.not.have.property('gdpr_consent');
    });

    it('should send the gdpr param if gdprApplies is true in the bidRequest', function () {
      const bidderRequestWithGDPR = Object.assign({gdprConsent: {gdprApplies: true, consentString: 'test-consent-string'}}, bidderRequest);
      const request = spec.buildRequests(bidRequests, bidderRequestWithGDPR);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.have.property('gdpr', true);
      expect(request.data.params).to.have.property('gdpr_consent', 'test-consent-string');
    });

    it('should have schain param if it is available in the bidRequest', () => {
      const schain = {
        ver: '1.0',
        complete: 1,
        nodes: [{ asi: 'indirectseller.com', sid: '00001', hp: 1 }],
      };
      bidRequests[0].schain = schain;
      const request = spec.buildRequests(bidRequests, bidderRequest);
      console.log(request);
      expect(request.data.params).to.be.an('object');
      expect(request.data.params).to.have.property('schain', '1.0,1!indirectseller.com,00001,1,,,');
    });

  //   it('should set floor_price to getFloor.floor value if it is greater than params.floorPrice', function() {
  //     const bid = deepClone(bidRequests[0]);
  //     bid.getFloor = () => {
  //       return {
  //         currency: 'USD',
  //         floor: 3.32
  //       }
  //     }
  //     bid.params.floorPrice = 0.64;
  //     const request = spec.buildRequests([bid], bidderRequest)[0];
  //     expect(request.data).to.be.an('object');
  //     expect(request.data).to.have.property('floor_price', 3.32);
  //   });

  //   it('should set floor_price to params.floorPrice value if it is greater than getFloor.floor', function() {
  //     const bid = deepClone(bidRequests[0]);
  //     bid.getFloor = () => {
  //       return {
  //         currency: 'USD',
  //         floor: 0.8
  //       }
  //     }
  //     bid.params.floorPrice = 1.5;
  //     const request = spec.buildRequests([bid], bidderRequest)[0];
  //     expect(request.data).to.be.an('object');
  //     expect(request.data).to.have.property('floor_price', 1.5);
  //   });
  });

  // describe('interpretResponse', function () {
  //   const response = {
  //     cpm: 12.5,
  //     vastXml: '<VAST version="3.0"></VAST>',
  //     width: 640,
  //     height: 480,
  //     requestId: '21e12606d47ba7',
  //     netRevenue: true,
  //     currency: 'USD',
  //     adomain: ['abc.com']
  //   };

  //   it('should get correct bid response', function () {
  //     let expectedResponse = [
  //       {
  //         requestId: '21e12606d47ba7',
  //         cpm: 12.5,
  //         width: 640,
  //         height: 480,
  //         creativeId: '21e12606d47ba7',
  //         currency: 'USD',
  //         netRevenue: true,
  //         ttl: TTL,
  //         vastXml: '<VAST version="3.0"></VAST>',
  //         mediaType: VIDEO,
  //         meta: {
  //           advertiserDomains: ['abc.com']
  //         }
  //       }
  //     ];
  //     const result = spec.interpretResponse({ body: response });
  //     expect(Object.keys(result[0])).to.have.members(Object.keys(expectedResponse[0]));
  //   });
  // })

  // describe('getUserSyncs', function() {
  //   const imageSyncResponse = {
  //     body: {
  //       userSyncPixels: [
  //         'https://image-sync-url.test/1',
  //         'https://image-sync-url.test/2',
  //         'https://image-sync-url.test/3'
  //       ]
  //     }
  //   };

  //   const iframeSyncResponse = {
  //     body: {
  //       userSyncURL: 'https://iframe-sync-url.test'
  //     }
  //   };

  //   it('should register all img urls from the response', function() {
  //     const syncs = spec.getUserSyncs({ pixelEnabled: true }, [imageSyncResponse]);
  //     expect(syncs).to.deep.equal([
  //       {
  //         type: 'image',
  //         url: 'https://image-sync-url.test/1'
  //       },
  //       {
  //         type: 'image',
  //         url: 'https://image-sync-url.test/2'
  //       },
  //       {
  //         type: 'image',
  //         url: 'https://image-sync-url.test/3'
  //       }
  //     ]);
  //   });

  //   it('should register the iframe url from the response', function() {
  //     const syncs = spec.getUserSyncs({ iframeEnabled: true }, [iframeSyncResponse]);
  //     expect(syncs).to.deep.equal([
  //       {
  //         type: 'iframe',
  //         url: 'https://iframe-sync-url.test'
  //       }
  //     ]);
  //   });

  //   it('should register both image and iframe urls from the responses', function() {
  //     const syncs = spec.getUserSyncs({ pixelEnabled: true, iframeEnabled: true }, [iframeSyncResponse, imageSyncResponse]);
  //     expect(syncs).to.deep.equal([
  //       {
  //         type: 'iframe',
  //         url: 'https://iframe-sync-url.test'
  //       },
  //       {
  //         type: 'image',
  //         url: 'https://image-sync-url.test/1'
  //       },
  //       {
  //         type: 'image',
  //         url: 'https://image-sync-url.test/2'
  //       },
  //       {
  //         type: 'image',
  //         url: 'https://image-sync-url.test/3'
  //       }
  //     ]);
  //   });

  //   it('should handle an empty response', function() {
  //     const syncs = spec.getUserSyncs({ iframeEnabled: true }, []);
  //     expect(syncs).to.deep.equal([]);
  //   });

  // it('should handle when user syncs are disabled', function() {
  //   const syncs = spec.getUserSyncs({ pixelEnabled: false }, [imageSyncResponse]);
  //   expect(syncs).to.deep.equal([]);
  // });
  // })
});
