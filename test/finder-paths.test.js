// Replays every Guide Me answer path through the finder engine, the way the
// Sep 28 site review audited it (880 paths, 22% dead ends, texture changing
// results in 7% of scenarios). Targets: zero dead ends; texture matters.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../public/finder-engine.js');

const INTENTS = { women: ['add', 'keep', 'cut'], men: ['any'] };

// Every path a client can click: who → length → texture → (intent) → goal → (branch).
function* paths() {
  for (const gender of ['women', 'men']) {
    for (const len of F.LENGTHS) {
      for (const texture of F.TEXTURES) {
        // "I already have locs" jumps straight to the loc lane.
        const intents = texture === 'locs' ? ['any'] : INTENTS[gender];
        for (const intent of intents) {
          const base = { gender, len, texture, intent };
          const goals = texture === 'locs' ? [{ goal: F.GOALS.find(g => g.id === 'locs'), available: F.goalAvailable(base, 'locs') }] : F.goalsFor(base);
          for (const { goal, available } of goals) {
            if (!available) continue;                       // locked tiles can't be clicked
            const br = F.BRANCHES[goal.id];
            const options = br ? br.options.filter(o => F.branchAvailable(base, goal.id, o)) : [null];
            for (const o of options) {
              yield { ...base, goals: [goal.id], branches: o ? { [goal.id]: o } : {} };
            }
          }
        }
      }
    }
  }
}

test('no clickable path ends without a match', () => {
  let n = 0; const dead = [];
  for (const p of paths()) { n++; if (!F.match(p).length) dead.push(p); }
  assert.ok(n > 300, `enumerated ${n} paths`);
  assert.deepEqual(dead, [], `${dead.length} of ${n} paths dead-end`);
});

test('every client gets several goals to choose from (no big-chop client with three)', () => {
  for (const gender of ['women', 'men']) for (const len of F.LENGTHS) for (const texture of F.TEXTURES) {
    if (texture === 'locs') continue;
    for (const intent of INTENTS[gender]) {
      const open = F.goalsFor({ gender, len, texture, intent }).filter(g => g.available).length;
      assert.ok(open >= (intent === 'cut' ? 2 : 4), `${gender}/${len}/${texture}/${intent}: ${open} goals open`);
    }
  }
});

test('texture changes what a client is shown in most scenarios', () => {
  // Scenario = everything but texture. Compare results across the textures
  // for which that scenario is reachable.
  const by = new Map();
  for (const p of paths()) {
    if (p.texture === 'locs') continue;
    const key = JSON.stringify([p.gender, p.len, p.intent, p.goals, p.branches]);
    if (!by.has(key)) by.set(key, new Set());
    by.get(key).add(F.match(p).map(s => s.n).join('|'));
  }
  // Only scenarios with a real choice: more than one service reachable across
  // textures. A perm or a freeform consult is the one right answer for everyone.
  const scenarios = [...by.values()].filter(v => new Set([...v].flatMap(x => x.split('|'))).size > 1);
  const changed = scenarios.filter(v => v.size > 1).length;
  const share = changed / scenarios.length;
  console.log(`texture changes results in ${changed} of ${scenarios.length} scenarios (${Math.round(share * 100)}%)`);
  assert.ok(share >= 0.5, `only ${Math.round(share * 100)}%`);
});

test('no card recommends a service meant for a different texture', () => {
  for (const p of paths()) for (const s of F.match(p)) assert.ok(s.tx.includes(p.texture), `${s.n} shown to ${p.texture}`);
});

test('the review\'s examples now land right', () => {
  const names = p => F.match(p).map(s => s.n);
  // Add hair + Natural Braids → braids on your own hair, no sew-ins.
  const nb = names({ gender: 'women', len: 'medium', texture: 'coily', intent: 'add', goals: ['protect'], branches: { protect: 'natural-braids' } });
  assert.ok(nb.includes('Natural Hair Braiding') && !nb.some(n => /Sew-In|Weave|Crochet/.test(n)), nb.join(', '));
  // Keep what I have: Individual Braids (all added hair) is not offered.
  assert.equal(F.branchAvailable({ gender: 'women', len: 'medium', texture: 'coily', intent: 'keep' }, 'protect', 'individual'), false);
  // A loc client (texture "I already have locs") finds a retwist at every length;
  // someone without locs isn't offered loc maintenance at all.
  for (const len of F.LENGTHS) assert.ok(names({ gender: 'women', len, texture: 'locs', intent: 'any', goals: ['locs'], branches: { locs: 'maintenance' } }).includes('Loc Retwist'), len);
  assert.equal(F.branchAvailable({ gender: 'women', len: 'medium', texture: 'coily', intent: 'add' }, 'locs', 'maintenance'), false);
  // "I already have locs" never sees a silk press or ponytail.
  for (const p of paths()) if (p.texture === 'locs') assert.ok(!names(p).some(n => /Silk Press|Ponytail/.test(n)), JSON.stringify(p));
  // Straight hair + Individual Braids → no sew-ins.
  assert.ok(!names({ gender: 'women', len: 'long', texture: 'straight', intent: 'add', goals: ['protect'], branches: { protect: 'individual' } }).some(n => /Sew-In/.test(n)));
  // Men: Cut & Fade differs by length; Embrace My Curls leads with natural styling.
  assert.notDeepEqual(names({ gender: 'men', len: 'twa', texture: 'coily', intent: 'any', goals: ['barber'] }), names({ gender: 'men', len: 'long', texture: 'coily', intent: 'any', goals: ['barber'] }));
  assert.equal(names({ gender: 'men', len: 'long', texture: 'curly', intent: 'any', goals: ['natural'] })[0], "Men's Natural Styling");
  // Very short + add hair → Weave & Extensions has something.
  assert.ok(F.goalAvailable({ gender: 'women', len: 'twa', texture: 'coily', intent: 'add' }, 'weave'));
});
