#Overview

Module Name: Kueez Bidder Adapter

Module Type: Bidder Adapter

Maintainer: prebid@kueez.com


# Description

The Kueez adapter requires setup and approval from the Kueez team. Please reach out to prebid@kueez.com for more information.

The adapter supports Banner and Video(instream) media types.

# Bid Parameters
## Video

| Name          | Scope | Type | Description                                                       | Example
|---------------| ----- | ---- |-------------------------------------------------------------------| -------
| `org` | required | String | the organization Id provided by your Kueez representative         | "test-publisher-id"
| `floorPrice`  | optional | Number | Minimum price in USD. Misuse of this parameter can impact revenue | 1.50
| `placementId` | optional | String | A unique placement identifier                                     | "12345678"
| `testMode`    | optional | Boolean | This activates the test mode                                      | false

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
          bidder: 'kueez',
          params: {
            org: 'test-publisher-id', // Required
            floorPrice: 1.50, // Optional
            placementId: '12345678', // Optional
            testMode: false // Optional
          }
        }]
      }
   ];
```
