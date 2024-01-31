#Overview

Module Name: STN Bidder Adapter

Module Type: Bidder Adapter

Maintainer: hb@stnvideo.com


# Description

Module that connects to STN's demand sources.

The STN adapter requires setup and approval from the STN. Please reach out to hb@stnvideo.com to create an STN account.

The adapter supports Video(instream).

# Bid Parameters
## Video

| Name | Scope | Type | Description | Example
| ---- | ----- | ---- | ----------- | -------
| `org` | required | String |  STN publisher Id provided by your STN representative  | "1234567890abcdef12345678"
| `floorPrice` | optional | Number |  Minimum price in USD. Misuse of this parameter can impact revenue | 2.00
| `placementId` | optional | String |  A unique placement identifier  | "12345678"
| `testMode` | optional | Boolean |  This activates the test mode  | false
| `rtbDomain` | optional | String |  Sets the seller end point  | "www.test.com"
| `currency` | optional | String | 3 letters currency | "EUR"


# Test Parameters
```javascript
var adUnits = [
       {
        code: 'dfp-video-div',
        sizes: [[640, 480]],
        mediaTypes: {
          video: {
            playerSize: [[640, 480]],
            context: 'instream'
          }
        },
        bids: [{
          bidder: 'stn',
          params: {
            org: '1234567890abcdef12345678', // Required
            floorPrice: 2.00, // Optional
            placementId: '12345678', // Optional
            testMode: false, // Optional,
            rtbDomain: "www.test.com" //Optional
          }
        }]
      }
   ];
```
