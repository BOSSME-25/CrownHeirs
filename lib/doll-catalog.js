// The Doll Maker's choices: bases, complexions, hair, garments, accessories,
// reveal settings, and the salon's terms. Plain data with no server
// dependencies, so the page's API, the layer-art manifest, the SVG and image
// exporters and the offline preview all read the same list.
//
// The option ids here are the ones in the page's share links and in the
// layer-art manifest (public/doll-maker/manifest.json); keep them stable.

const BASES = [
  { id: 'girl', name: 'Girl', defaults: { hairStyle: 'locs',        hairColor: 'black', top: 'cardigan', topColor: 'ivory', bottom: 'joggers', bottomColor: 'sage', shoes: 'sneakers-white' } },
  { id: 'boy',  name: 'Boy',  defaults: { hairStyle: 'short-curls', hairColor: 'black', top: 'flannel', topColor: 'sage', bottom: 'dress-pants', bottomColor: 'ivory', shoes: 'sneakers-black' } }
];
// The yarn for the skin. Called `shade` in requests, as it always has been.
const SHADES = [
  { id: 'rich-espresso', name: 'Rich Espresso', hex: '#4a2a1d' },
  { id: 'deep-brown',    name: 'Deep Brown',    hex: '#5f3722' },
  { id: 'warm-brown',    name: 'Warm Brown',    hex: '#7d4a2c' },
  { id: 'golden-brown',  name: 'Golden Brown',  hex: '#96603a' },
  { id: 'caramel',       name: 'Caramel',       hex: '#b37a4c' }
];
// Shades offered before the Doll Maker, so older requests still read right.
const PAST_SHADES = { espresso: 'Espresso', cocoa: 'Cocoa', mocha: 'Mocha', honey: 'Honey', almond: 'Almond', sand: 'Sand', cream: 'Cream' };
const HAIR_COLORS = [
  { id: 'black',        name: 'Black',        hex: '#1b1b1b' },
  { id: 'dark-brown',   name: 'Dark brown',   hex: '#3b2418' },
  { id: 'brown',        name: 'Brown',        hex: '#5c3a21' },
  { id: 'auburn',       name: 'Auburn',       hex: '#7a3b1e' },
  { id: 'honey-blonde', name: 'Honey blonde', hex: '#c9963e' },
  { id: 'blonde',       name: 'Blonde',       hex: '#e6c87a' },
  { id: 'burgundy',     name: 'Burgundy',     hex: '#6b1f3a' },
  { id: 'red',          name: 'Red',          hex: '#b2321f' },
  { id: 'blue',         name: 'Blue',         hex: '#2f4f9e' },
  { id: 'purple',       name: 'Purple',       hex: '#6a3fa0' },
  { id: 'pink',         name: 'Pink',         hex: '#d26a9a' },
  { id: 'silver',       name: 'Silver',       hex: '#a8a8a8' }
];
// Two colours: the client picks a highlight colour from the same list; whole
// strands of it, root to tip, are mixed through the first colour.
const HAIR_STYLES = [
  { id: 'locs',        name: 'Locs' },
  { id: 'box-braids',  name: 'Box braids' },
  { id: 'afro-puffs',  name: 'Afro puffs' },
  { id: 'twists',      name: 'Twists' },
  { id: 'curly-afro',  name: 'Curly fro' },
  { id: 'cornrows',    name: 'Cornrows' },
  { id: 'short-curls', name: 'Short curls / fade' },
  { id: 'straight',    name: 'Silk press' },
  { id: 'loose-curls', name: 'Loose curls' },
  { id: 'bantu-knots', name: 'Bantu knots' },
  { id: 'ponytail',    name: 'Ponytail' },
  { id: 'bun',         name: 'Top bun' }
];

// The look. A garment with more than one colour takes one of its `colors`
// (the first is the default); `{c}` in its name is where the colour goes.
const GARMENT_COLORS = [
  { id: 'black',    name: 'Black',      hex: '#1f1d1b' },
  { id: 'white',    name: 'White',      hex: '#f7f4ee' },
  { id: 'ivory',    name: 'Ivory',      hex: '#ece2cf' },
  { id: 'grey',     name: 'Grey',       hex: '#8f8c88' },
  { id: 'pink',     name: 'Pink',       hex: '#e58fb0' },
  { id: 'blush',    name: 'Blush',      hex: '#f0bfcb' },
  { id: 'red',      name: 'Red',        hex: '#c0392b' },
  { id: 'gold',     name: 'Gold',       hex: '#d9a93a' },
  { id: 'yellow',   name: 'Yellow',     hex: '#e9bf3c' },
  { id: 'sage',     name: 'Sage',       hex: '#9aae8c' },
  { id: 'lavender', name: 'Lavender',   hex: '#b49ad8' },
  { id: 'royal',    name: 'Royal blue', hex: '#2a4fa8' },
  { id: 'denim',    name: 'Blue',       hex: '#4a6a94' },
  { id: 'khaki',    name: 'Khaki',      hex: '#b8a06e' },
  { id: 'brown',    name: 'Brown',      hex: '#6b4a32' }
];
const TOPS = [
  { id: 'ch-hoodie',    name: 'Pink Crown Heirs hoodie',          look: 'hoodie',   colors: ['pink'],  brand: true, group: 'Crown Heirs' },
  { id: 'ch-sweater',   name: 'Royal blue Crown Heirs sweater',   look: 'sweater',  colors: ['royal'], brand: true, group: 'Crown Heirs' },
  { id: 'tee',          name: '{c} tee',                          look: 'tee',      colors: ['red', 'white', 'black', 'yellow', 'lavender'], group: 'Casual' },
  { id: 'denim-jacket', name: 'Denim jacket over a {c} tee',      look: 'jacket',   colors: ['white', 'pink', 'black'], group: 'Casual' },
  { id: 'cardigan',     name: '{c} fuzzy cardigan',               look: 'cardigan', colors: ['blush', 'ivory', 'lavender'], group: 'Dressy' },
  { id: 'flannel',      name: '{c} plaid flannel',                look: 'flannel',  colors: ['red', 'sage'], group: 'Seasonal' }
];
const BOTTOMS = [
  { id: 'joggers',     name: '{c} joggers',     look: 'joggers', colors: ['pink', 'black', 'grey', 'lavender', 'sage'] },
  { id: 'jeans',       name: '{c} jeans',       look: 'jeans',   colors: ['denim', 'black', 'white'] },
  { id: 'shorts',      name: '{c} shorts',      look: 'shorts',  colors: ['denim', 'khaki', 'pink', 'black'] },
  { id: 'skirt',       name: '{c} skirt',       look: 'skirt',   colors: ['black', 'pink', 'gold', 'denim'] },
  { id: 'dress-pants', name: '{c} dress pants', look: 'wide',    colors: ['black', 'ivory', 'blush'] }
];
const SHOES = [
  { id: 'sneakers-pink',  name: 'Pink and white sneakers',  look: 'sneakers', main: '#e58fb0', trim: '#f7f4ee' },
  { id: 'sneakers-black', name: 'Black and white sneakers', look: 'sneakers', main: '#1f1d1b', trim: '#f7f4ee' },
  { id: 'sneakers-white', name: 'White sneakers',           look: 'sneakers', main: '#f7f4ee', trim: '#f7f4ee' },
  { id: 'boots',          name: '{c} boots',                look: 'boots',    colors: ['brown', 'black', 'white'] },
  { id: 'dress-shoes',    name: '{c} dress shoes',          look: 'flats',    colors: ['black', 'white', 'pink'] }
];
// `clashes`: hair it can't sit on. `excludes`: another accessory it can't be
// worn with. `available: false` shows it as coming soon.
const ACCESSORIES = [
  { id: 'bag',     name: 'Crossbody bag' },
  { id: 'glasses', name: 'Glasses' },
  { id: 'hat',     name: 'Bucket hat', clashes: ['afro-puffs', 'curly-afro', 'bun', 'bantu-knots'], excludes: ['crown'] },
  { id: 'bow',     name: 'Hair bow' },
  { id: 'jewelry', name: 'Gold hoops and necklace' },
  // Placed only from the approved Crown Heirs crown file, never drawn.
  { id: 'crown',   name: 'Crown Heirs crown', excludes: ['hat'] }
];
const BACKGROUNDS = [
  { id: 'throne',  name: 'Signature throne' },
  { id: 'neutral', name: 'Crown Heirs reveal' }
];
const MAX_QTY = 5;
// Pricing is by quote, per doll; turnaround is set by the salon. Shown on the
// page and in every message, from here.
const TURNAROUND = '4–6 weeks';

const byId = (list, id) => list.find(x => x.id === id);
const lower = n => String(n).toLowerCase().replace(/crown heirs/g, 'Crown Heirs');   // the name keeps its capitals mid-sentence

function options() {
  return { bases: BASES, shades: SHADES, hairColors: HAIR_COLORS, hairStyles: HAIR_STYLES, garmentColors: GARMENT_COLORS,
    tops: TOPS, bottoms: BOTTOMS, shoes: SHOES, accessories: ACCESSORIES, backgrounds: BACKGROUNDS, maxQuantity: MAX_QTY, pricing: 'quote', turnaround: TURNAROUND };
}

// "Red tee", "Pink Crown Heirs hoodie": the garment's name with its colour.
function itemName(list, id, color) {
  const it = byId(list, id); if (!it) return id || '';
  const c = byId(GARMENT_COLORS, color || (it.colors || [])[0]);
  const n = it.name.replace('{c}', c ? c.name.toLowerCase() : '').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

module.exports = { options, itemName, byId, lower, BASES, SHADES, PAST_SHADES, HAIR_COLORS, HAIR_STYLES, GARMENT_COLORS, TOPS, BOTTOMS, SHOES, ACCESSORIES, BACKGROUNDS, MAX_QTY, TURNAROUND };
