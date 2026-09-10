/*
 * Card icons for the panel: original SVG drawings in the visual language of
 * Catan/colonist.io cards (coloured card with a rounded frame and a flat
 * emblem), so they read at 16-20 px without using anyone else's artwork.
 *
 * Exposed as window.CCTIcons: { res: [8 svg strings], back, devBack, dev: {11..15} }.
 * Resource order matches CCT.Protocol card type indexes:
 * lumber, brick, wool, grain, ore, cloth, coin, paper.
 */
(function () {
  'use strict';

  // 20x28 card. `bg` fills the card, `emblem` is drawn inside a 16x22 inner area at (2,3).
  function card(bg, emblem, extra) {
    return '<svg class="cct-card' + (extra ? ' ' + extra : '') + '" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="0.5" y="0.5" width="19" height="27" rx="2.5" fill="' + bg + '" stroke="rgba(255,255,255,0.85)"/>' +
      '<rect x="2" y="3" width="16" height="22" rx="1.5" fill="rgba(255,255,255,0.14)"/>' +
      emblem + '</svg>';
  }

  var lumber = card('#2e7d32',
    '<path d="M10 5 L15 13 H12.5 L16 19 H4 L7.5 13 H5 Z" fill="#a5d6a7"/>' +
    '<rect x="8.6" y="19" width="2.8" height="4" fill="#6d4c41"/>');

  var brick = card('#c0562c',
    '<rect x="3.5" y="8" width="6" height="3.6" fill="#f4b59a"/><rect x="10.5" y="8" width="6" height="3.6" fill="#f4b59a"/>' +
    '<rect x="6.5" y="12.4" width="7" height="3.6" fill="#f4b59a"/>' +
    '<rect x="3.5" y="16.8" width="6" height="3.6" fill="#f4b59a"/><rect x="10.5" y="16.8" width="6" height="3.6" fill="#f4b59a"/>');

  var wool = card('#7cb342',
    '<ellipse cx="10.5" cy="14" rx="5.5" ry="4" fill="#fafafa"/>' +
    '<circle cx="5.6" cy="12.6" r="2.1" fill="#37474f"/>' +
    '<rect x="7.2" y="17" width="1.4" height="3" fill="#37474f"/><rect x="12.2" y="17" width="1.4" height="3" fill="#37474f"/>');

  var grain = card('#e2a921',
    '<path d="M10 22 V8" stroke="#6d4c41" stroke-width="1.4"/>' +
    '<ellipse cx="7.6" cy="10" rx="2.1" ry="1.3" fill="#fff3c4" transform="rotate(-35 7.6 10)"/>' +
    '<ellipse cx="12.4" cy="10" rx="2.1" ry="1.3" fill="#fff3c4" transform="rotate(35 12.4 10)"/>' +
    '<ellipse cx="7.4" cy="13.5" rx="2.1" ry="1.3" fill="#fff3c4" transform="rotate(-35 7.4 13.5)"/>' +
    '<ellipse cx="12.6" cy="13.5" rx="2.1" ry="1.3" fill="#fff3c4" transform="rotate(35 12.6 13.5)"/>' +
    '<ellipse cx="7.4" cy="17" rx="2.1" ry="1.3" fill="#fff3c4" transform="rotate(-35 7.4 17)"/>' +
    '<ellipse cx="12.6" cy="17" rx="2.1" ry="1.3" fill="#fff3c4" transform="rotate(35 12.6 17)"/>');

  var ore = card('#6f7b8a',
    '<path d="M4 20 L7 11 L10.5 8 L14.5 12 L16 20 Z" fill="#cfd8dc"/>' +
    '<path d="M7 11 L10.5 8 L11.5 14 L8.5 16 Z" fill="#eceff1"/>');

  var cloth = card('#8e6ac8',
    '<path d="M4 10 Q7 7 10 10 T16 10 V13 Q13 16 10 13 T4 13 Z" fill="#e8dcff"/>' +
    '<path d="M4 16 Q7 13 10 16 T16 16 V19 Q13 22 10 19 T4 19 Z" fill="#e8dcff"/>');

  var coin = card('#c99a12',
    '<circle cx="10" cy="14" r="5.5" fill="#ffe082" stroke="#8d6e00" stroke-width="1"/>' +
    '<circle cx="10" cy="14" r="2.5" fill="none" stroke="#8d6e00" stroke-width="1"/>');

  var paper = card('#b8a98a',
    '<rect x="5" y="7" width="10" height="14" rx="1" fill="#fff8e1"/>' +
    '<path d="M7 11 H13 M7 14 H13 M7 17 H11" stroke="#8d6e63" stroke-width="1"/>');

  // Resource card back (used for the "total cards" column).
  var back = card('#3c6fd0',
    '<rect x="4" y="5" width="12" height="18" rx="1.5" fill="none" stroke="rgba(255,255,255,0.6)"/>' +
    '<text x="10" y="18.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fff">?</text>');

  // Development card back and faces (parchment with an emblem).
  var devBack = card('#5e35b1',
    '<rect x="4" y="5" width="12" height="18" rx="1.5" fill="none" stroke="rgba(255,255,255,0.6)"/>' +
    '<path d="M10 8.5 L11.4 12.2 L15.3 12.4 L12.2 14.8 L13.3 18.6 L10 16.4 L6.7 18.6 L7.8 14.8 L4.7 12.4 L8.6 12.2 Z" fill="#ffe082"/>');
  var PARCH = '#e9dcc2';
  var knight = card(PARCH,
    '<path d="M6 12 A4 4 0 0 1 14 12 V17 H6 Z" fill="#78909c"/>' +
    '<rect x="8.6" y="12" width="2.8" height="5" fill="#37474f"/>' +
    '<path d="M6 17 H14 V20 H6 Z" fill="#546e7a"/>' +
    '<path d="M10 6 V9" stroke="#c62828" stroke-width="2"/>');
  var vp = card(PARCH,
    '<path d="M10 6.5 L11.9 11.3 L17 11.6 L13 14.8 L14.4 19.8 L10 17 L5.6 19.8 L7 14.8 L3 11.6 L8.1 11.3 Z" fill="#f2b705" stroke="#a67c00" stroke-width="0.8"/>');
  var monopoly = card(PARCH,
    '<path d="M4 19 L5 10 L8 14 L10 8 L12 14 L15 10 L16 19 Z" fill="#f2b705" stroke="#a67c00" stroke-width="0.8"/>' +
    '<rect x="4" y="19" width="12" height="2.2" fill="#a67c00"/>');
  var roadBuilding = card(PARCH,
    '<path d="M5 22 L8 6 H12 L15 22 Z" fill="#5d4037"/>' +
    '<path d="M10 8 V11 M10 13.5 V16.5 M10 19 V21" stroke="#fff8e1" stroke-width="1.2"/>');
  var yearOfPlenty = card(PARCH,
    '<rect x="4" y="9" width="7" height="10" rx="1" fill="#e2a921" transform="rotate(-12 7.5 14)"/>' +
    '<rect x="9" y="9" width="7" height="10" rx="1" fill="#2e7d32" transform="rotate(12 12.5 14)"/>');

  var drawn = {
    res: [lumber, brick, wool, grain, ore, cloth, coin, paper],
    back: back,
    devBack: devBack,
    dev: { 11: knight, 12: vp, 13: monopoly, 14: roadBuilding, 15: yearOfPlenty }
  };

  // colonist.io's own card images, loaded from its CDN at runtime (never bundled).
  // Asset names carry a content hash, so they only change when the artwork changes;
  // content.js re-discovers them from the live site if one fails to load and falls
  // back to the drawings above if that fails too.
  var CDN = 'https://cdn.colonist.io/dist/assets/';
  var colonistDefaults = {
    res: ['card_lumber.cf22f8083cf89c2a29e7', 'card_brick.5950ea07a7ea01bc54a5', 'card_wool.17a6dea8d559949f0ccc',
      'card_grain.09c9d82146a64bce69b5', 'card_ore.117f64dab28e1c987958', 'card_cloth.d0d158fa81f0eb0b0a3b',
      'card_coin.fa1ec5179bfed0886c9d', 'card_paper.42eb7a7b91cc9cf155f3'],
    back: 'card_rescardback.03c18312a76028b0d9c9',
    devBack: 'card_devcardback.92569a1abd04a8c1c17e',
    dev: { 11: 'card_knight.a58573f2154fa93a6319', 12: 'card_vp.672597308e3a8f1100ae', 13: 'card_monopoly.dfac189aaff62e271093',
      14: 'card_roadbuilding.994e8f21698ce6c350bd', 15: 'card_yearofplenty.3df210b5455b7438db09' }
  };
  // Asset base names as they appear in colonist's bundle (assets/<name>.<hash>.svg).
  var colonistNames = {
    res: ['card_lumber', 'card_brick', 'card_wool', 'card_grain', 'card_ore', 'card_cloth', 'card_coin', 'card_paper'],
    back: 'card_rescardback',
    devBack: 'card_devcardback',
    dev: { 11: 'card_knight', 12: 'card_vp', 13: 'card_monopoly', 14: 'card_roadbuilding', 15: 'card_yearofplenty' }
  };

  function img(asset, extra) {
    return '<img class="cct-card' + (extra ? ' ' + extra : '') + '" src="' + CDN + asset + '.svg" alt="" draggable="false">';
  }
  /** Icon set built from an asset map shaped like colonistDefaults. */
  function fromAssets(map) {
    var out = { res: [], back: img(map.back), devBack: img(map.devBack), dev: {} };
    for (var i = 0; i < map.res.length; i++) out.res.push(img(map.res[i]));
    for (var k in map.dev) out.dev[k] = img(map.dev[k]);
    return out;
  }

  // Panel logo: the extension icon (icons/icon.svg) without filters, for the title bar.
  var logo = '<svg class="cct-logo" viewBox="16 12 96 104" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<polygon points="64,16 105.6,40 105.6,88 64,112 22.4,88 22.4,40" fill="#2c7fc0" stroke="#123f6e" stroke-width="3" stroke-linejoin="round"/>' +
    '<g transform="rotate(-14 62 68)"><rect x="36" y="38" width="38" height="52" rx="4.5" fill="#e2a921" stroke="#fff" stroke-width="3"/></g>' +
    '<g transform="rotate(10 72 74)"><rect x="52" y="44" width="40" height="54" rx="4.5" fill="#3a9540" stroke="#fff" stroke-width="3"/>' +
    '<text x="72" y="83" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="36" font-weight="700" fill="#fff">%</text></g></svg>';

  window.CCTIcons = {
    logo: logo,
    drawn: drawn,
    colonistDefaults: colonistDefaults,
    colonistNames: colonistNames,
    cdn: CDN,
    fromAssets: fromAssets
  };
})();
