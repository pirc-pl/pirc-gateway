/*
 * Base64 Encoder and Decoder shims for client-side.
 * Based on: https://github.com/dankogai/js-base64/
 * 
 * Licensed under the MIT license.
 *   http://opensource.org/licenses/mit-license
 *
 * References:
 *   http://en.wikipedia.org/wiki/Base64
 */
(function(window) {
  'use strict';

  // constants
  var b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    , fromCharCode = String.fromCharCode
    , re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g
    , b64tab, cb_utob, utob, cb_encode, btoa
    , re_btou, cb_btou, btou, cb_decode, atob
  ;

  b64tab = (function (bin) {
    var t = {};
    for (var i = 0, l = bin.length; i < l; i++) t[bin.charAt(i)] = i;
      return t;
  })(b64chars);

  // encoder stuff
  cb_utob = function (c) {
    if (c.length < 2) {
      var cc = c.charCodeAt(0);
      return cc < 0x80 ? c
      : cc < 0x800 ? (fromCharCode(0xc0 | (cc >>> 6))
                      + fromCharCode(0x80 | (cc & 0x3f)))
      : (fromCharCode(0xe0 | ((cc >>> 12) & 0x0f))
         + fromCharCode(0x80 | ((cc >>>  6) & 0x3f))
         + fromCharCode(0x80 | ( cc         & 0x3f)));
    } else {
      var cc = 0x10000
      + (c.charCodeAt(0) - 0xD800) * 0x400
      + (c.charCodeAt(1) - 0xDC00);
      return (fromCharCode(0xf0 | ((cc >>> 18) & 0x07))
              + fromCharCode(0x80 | ((cc >>> 12) & 0x3f))
              + fromCharCode(0x80 | ((cc >>>  6) & 0x3f))
              + fromCharCode(0x80 | ( cc         & 0x3f)));
    }
  };

  utob = function (u) {
    return u.replace(re_utob, cb_utob);
  };

  cb_encode = function (ccc) {
    var padlen = [0, 2, 1][ccc.length % 3],
    ord = ccc.charCodeAt(0) << 16
    | ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8)
    | ((ccc.length > 2 ? ccc.charCodeAt(2) : 0)),
    chars = [
    b64chars.charAt( ord >>> 18),
    b64chars.charAt((ord >>> 12) & 63),
    padlen >= 2 ? '=' : b64chars.charAt((ord >>> 6) & 63),
    padlen >= 1 ? '=' : b64chars.charAt(ord & 63)
    ];
    return chars.join('');
  };

  btoa = function (b) {
    return b.replace(/[\s\S]{1,3}/g, cb_encode);
  };

  // decoder stuff
  re_btou = new RegExp([
                       '[\xC0-\xDF][\x80-\xBF]',
                       '[\xE0-\xEF][\x80-\xBF]{2}',
                       '[\xF0-\xF7][\x80-\xBF]{3}'
                       ].join('|'), 'g');

  cb_btou = function (cccc) {
    switch (cccc.length) {
      case 4:
        var cp = ((0x07 & cccc.charCodeAt(0)) << 18)
        |    ((0x3f & cccc.charCodeAt(1)) << 12)
        |    ((0x3f & cccc.charCodeAt(2)) <<  6)
        |     (0x3f & cccc.charCodeAt(3)),
        offset = cp - 0x10000;
        return (fromCharCode((offset  >>> 10) + 0xD800)
                + fromCharCode((offset & 0x3FF) + 0xDC00));
      case 3:
        return fromCharCode(
                            ((0x0f & cccc.charCodeAt(0)) << 12)
                            | ((0x3f & cccc.charCodeAt(1)) << 6)
                            |  (0x3f & cccc.charCodeAt(2))
                            );
      default:
        return  fromCharCode(
                             ((0x1f & cccc.charCodeAt(0)) << 6)
                             |  (0x3f & cccc.charCodeAt(1))
                             );
    }
  };
  
  btou = function (b) {
    return b.replace(re_btou, cb_btou);
  };

  cb_decode = function (cccc) {
    var len = cccc.length
      , padlen = len % 4
      , n = (len > 0 ?
             b64tab[cccc.charAt(0)] << 18 : 0) |
             (len > 1 ? b64tab[cccc.charAt(1)] << 12 : 0)
             | (len > 2 ? b64tab[cccc.charAt(2)] <<  6 : 0)
             | (len > 3 ? b64tab[cccc.charAt(3)]       : 0)
      , chars = [
                fromCharCode( n >>> 16),
                fromCharCode((n >>>  8) & 0xff),
                fromCharCode( n         & 0xff)
                ]
    ;
    chars.length -= [0, 0, 2, 1][padlen];
    return chars.join('');
  };
  
  atob = function (a){
    return a.replace(/[\s\S]{1,4}/g, cb_decode);
  };

  if (!window || !window.atob || !window.btoa){
    window.atob = atob;
    window.btoa = btoa;
  }
  window.Base64 = {'decode': atob, 'encode': btoa};
})(window);
