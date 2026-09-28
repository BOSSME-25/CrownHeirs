/* ════════════════════════════════════════════════════════════════════
   Crown Heirs finder engine: the services, the goals, and the rules that
   match one to a client. Plain script: the homepage loads it as
   window.FINDER, and the tests require() it to replay every answer path.

   Rules (from the Sep 28 site review):
   • Texture is a filter, not a tiebreaker. A service only shows for the
     textures it lists ("transitioning" = relaxed ends, natural roots).
   • Length is a filter too, and a "best at this length" nudge.
   • "Open to adding hair" still allows services on your own hair; "keep
     what I have" never shows added hair; "cut" shows cuts.
   • A goal with branches (locs, chemical, protect) only credits services
     in the branch the client picked, so sew-ins can't leak into Natural
     Braids and a retwist can't hide from a loc client open to extensions.
   • Goals and branches are offered only when they lead to a result, so
     no path ends at "Email us".
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  const GOALS=[
    {"id":"protect","e":"🌿","img":"braids-knotless","p":"ph2","l":"Protect & Grow","d":"Give my hair a break and help it grow","gender":["women"]},
    {"id":"sleek","e":"✨","img":"keratin-treatment-crown-smooth-experience","p":"ph1","l":"Sleek & Polished","d":"Smooth, straight, professional look","gender":["women"]},
    {"id":"cut","e":"✂️","img":"hair-cut","p":"ph7","l":"Fresh Cut or Shape","d":"A trim, cut, or whole new shape","gender":["women"]},
    {"id":"locs","e":"🔱","img":"loc-retwist","p":"ph4","l":"Start or Keep Locs","d":"Begin or maintain my loc journey","gender":["women","men"]},
    {"id":"scalp","e":"💧","img":"hair-and-scalp-treatments-add-ons","p":"ph5","l":"Scalp Reset","d":"Dryness, flakes, buildup, my scalp needs relief","gender":["women","men"]},
    {"id":"natural","e":"🌀","img":"curl-definition-restoration","imgMen":"loose-natural-styles","p":"ph3","l":"Embrace My Curls","d":"Show off my natural texture","gender":["women","men"]},
    {"id":"occasion","e":"👑","img":"sleek-ponytail","p":"ph6","l":"Special Occasion","d":"Wedding, prom, event, I want to feel elevated","gender":["women"]},
    {"id":"weave","e":"➰","img":"weave-installation","p":"ph2","l":"Weave & Extensions","d":"Sew-in, quick weave, crochet, tape-in, microlinks","gender":["women"]},
    {"id":"chemical","e":"🧪","img":"color","p":"ph1","l":"Chemical Service","d":"Relaxer, perm, or color on loose hair","gender":["women"]},
    {"id":"shampoo","e":"💧","img":"shampoo-and-blow-dry","p":"ph3","l":"Shampoo & Style","d":"Wash, condition, style, between appointments","gender":["women","men"]},
    {"id":"health","e":"🌱","img":"consultations","p":"ph5","l":"Hair Health","d":"Thinning, breakage, edges, shedding or damage","gender":["women","men"]},
    {"id":"barber","e":"💈","imgPath":"/images/length/men-short.jpg","p":"ph7","l":"Cut & Fade","d":"Fresh cut, taper, fade, or shape-up","gender":["men"]},
    {"id":"beard","e":"🧔🏾","imgPath":"/images/length/men-very-short.jpg","p":"ph7","l":"Beard & Line-up","d":"Crisp hairline and beard sculpt","gender":["men"]},
    {"id":"braids_m","e":"🌿","img":"natural-hair-braiding","p":"ph2","l":"Braids & Cornrows","d":"Custom cornrows or braids built for you","gender":["men"]}
  ];
  const SVCS=[
    {"n":"Pixie & Tapered Cut","d":"Sculpted short cut shaped to your face, soft and feminine or bold and strong.","dur":"1 to 1.5 hrs","price":"From $65","badge":"Cut","e":"✂️","p":"ph7","goals":["cut","sleek"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate"],"in":["cut"],"len":["twa","short","medium"],"gender":["women"]},
    {"n":"Shape Up & Trim","d":"Precision trim or edge-up that gives any existing style a clean, fresh finish.","dur":"45 min","price":"From $35","badge":"Trim","e":"✂️","p":"ph7","goals":["cut","barber","health"],"tx":["straight","wavy","curly","coily","locs"],"ls":["minimal","moderate","invested"],"in":["cut"],"len":["short","medium","long"],"gender":["women","men"],"lenBest":["medium","long"]},
    {"n":"Silk Press","d":"Silky straight hair using heat, no chemicals. Best for medium to long natural hair.","dur":"2 to 3 hrs","price":"From $85","badge":"Classic","e":"✨","p":"ph1","goals":["sleek"],"tx":["curly","coily","wavy"],"ls":["moderate","invested"],"in":["keep"],"len":["medium","long"],"gender":["women"],"lasts":"until your next wash"},
    {"n":"Knotless Braids","d":"Tension-free box braids with added hair. Any natural length. Lasts 6 to 8 weeks.","dur":"4 to 6 hrs","price":"From $175","badge":"Best Seller","e":"🌿","p":"ph2","goals":["protect","sleek"],"tx":["curly","coily","wavy","straight"],"ls":["minimal","moderate"],"in":["add"],"len":["twa","short","medium","long"],"gender":["women"],"protect":["individual"],"lasts":"6 to 8 weeks"},
    {"n":"Senegalese / Box Twists","d":"Long, smooth rope-like twists with added hair. Lightweight, versatile, lasts 6 to 8 weeks.","dur":"5 to 7 hrs","price":"From $185","badge":"Extensions","e":"🌿","p":"ph2","goals":["protect","sleek"],"tx":["curly","coily","wavy","straight"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"],"protect":["individual"],"lasts":"6 to 8 weeks"},
    {"n":"Feed-In Style Braids","d":"Cornrow-based feed-in braids with natural-color hair. Includes shampoo & conditioning.","dur":"1.5 to 2.5 hrs","price":"From $95","badge":"Cornrows","e":"🌿","p":"ph2","goals":["protect"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"],"protect":["individual"]},
    {"n":"Faux Locs — Butterfly","d":"Lightweight, bohemian faux locs with a textured, wispy finish. Added hair.","dur":"5 to 7 hrs","price":"From $265","badge":"Faux Locs","e":"🌿","p":"ph2","goals":["protect"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"],"protect":["individual"]},
    {"n":"Faux Locs — Soft","d":"Softer-textured faux locs, clean, smooth, long-lasting protective style.","dur":"5 to 7 hrs","price":"From $265","badge":"Faux Locs","e":"🌿","p":"ph2","goals":["protect"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"],"protect":["individual"]},
    {"n":"Individuals Over Locs","d":"Protective individual braids or twists installed over existing locs.","dur":"5 hrs","price":"From $275","badge":"Over Locs","e":"🌿","p":"ph2","goals":["protect"],"tx":["locs"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"],"protect":["individual"],"loc":["styling"]},
    {"n":"Mini Twists w/ Added Hair","d":"Loose-natural protective style with added hair. Shampoo, condition, and blow dry included.","dur":"2.5 hrs+","price":"From $225","badge":"Twists","e":"🌿","p":"ph2","goals":["protect"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"],"protect":["individual"]},
    {"n":"Natural Hair Braiding","d":"Braiding using your own natural hair, no extensions. Includes shampoo, condition, and blow dry.","dur":"1.75 hrs+","price":"Varies","badge":"Natural","e":"🌿","p":"ph5","goals":["protect","natural"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women"],"protect":["natural-braids"]},
    {"n":"Mini Twists (Two Strands)","d":"Loose-natural protective mini twists with your own hair. Shampoo, conditioning, and blow dry included.","dur":"1.5 hrs+","price":"From $125","badge":"Natural","e":"🌿","p":"ph5","goals":["protect","natural"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["keep"],"len":["short","medium","long"],"gender":["women"],"protect":["natural-braids"]},
    {"n":"Curl Definition + Restoration","d":"Intentional definition and hydration for your curls. Includes shampoo + conditioning and curl definition.","dur":"45 min+","price":"From $65","badge":"Natural","e":"🌀","p":"ph3","goals":["protect","natural","health"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate","invested"],"in":["keep","cut"],"len":["twa","short","medium","long"],"gender":["women"],"protect":["natural-styles"]},
    {"n":"Sew-In Weave Installation","d":"Full sew-in install with styling. Hair not included. Consultation recommended.","dur":"4 hrs+","price":"From $375","badge":"Sew-In","e":"➰","p":"ph2","goals":["weave"],"tx":["curly","coily","wavy","straight"],"ls":["moderate","invested"],"in":["add"],"len":["short","medium","long"],"gender":["women"]},
    {"n":"Partial Sew-In","d":"Partial install, leave-out natural hair blended with added hair.","dur":"2 hrs","price":"From $175","badge":"Partial","e":"➰","p":"ph2","goals":["weave"],"tx":["curly","coily","wavy","straight"],"ls":["moderate","invested"],"in":["add"],"len":["medium","long"],"gender":["women"]},
    {"n":"Quick Weave","d":"Bonded quick weave install with shampoo and conditioning included.","dur":"3 hrs","price":"From $200","badge":"Weave","e":"➰","p":"ph2","goals":["weave"],"tx":["curly","coily","wavy","straight"],"ls":["minimal","moderate"],"in":["add"],"len":["twa","short","medium","long"],"gender":["women"]},
    {"n":"Crochet Styles","d":"Hair extension styling installed using the crochet method. Shampoo & conditioning included.","dur":"2.5 hrs+","price":"From $180","badge":"Crochet","e":"➰","p":"ph2","goals":["weave"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add"],"len":["short","medium","long"],"gender":["women"]},
    {"n":"Hair Extensions","d":"Tape-in or microlinks extension install. Long-lasting, natural-looking length.","dur":"2 hrs+","price":"From $200","badge":"Extensions","e":"➰","p":"ph2","goals":["weave"],"tx":["straight","wavy","curly","coily"],"ls":["moderate","invested"],"in":["add"],"len":["short","medium","long"],"gender":["women"]},
    {"n":"Natural Hair Styling","d":"Wash-and-gos, braid-outs, defined sets, your natural texture in full expression.","dur":"1.5 to 2.5 hrs","price":"From $55","badge":"Natural","e":"🌀","p":"ph3","goals":["natural","protect"],"tx":["curly","coily","wavy"],"ls":["moderate","invested"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["women"],"protect":["natural-styles"]},
    {"n":"Updo & Special Occasion","d":"Elevated looks for elevated moments, bridal, prom, event styling.","dur":"1.5 to 2.5 hrs","price":"From $95","badge":"Occasion","e":"👑","p":"ph6","goals":["occasion","sleek"],"tx":["straight","wavy","curly","coily","locs"],"ls":["moderate","invested"],"in":["keep","add"],"len":["short","medium","long"],"gender":["women"]},
    {"n":"Keratin Smoothing Treatment","d":"Keratin smoothing that cuts frizz and daily styling time for three to five months. It is not a relaxer and does not permanently change your texture. Final price is set at your consultation.","dur":"3h 15m+","price":"Consult","badge":"Smooth","e":"✨","p":"ph1","goals":["sleek","health"],"tx":["wavy","curly","coily"],"ls":["minimal","moderate"],"in":["keep"],"len":["short","medium","long"],"gender":["women"],"disclaimer":true},
  {"n":"Sleek Ponytail","d":"Sleek ponytail at any length, your choice of braided, curled, or straight finish.","dur":"1.25 hrs+","price":"From $115","badge":"Sleek","e":"✨","p":"ph1","goals":["sleek","occasion"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate"],"in":["keep","add"],"len":["short","medium","long"],"gender":["women"]},
    {"n":"Shampoo & Style","d":"Signature shampoo, conditioning, and molded to your desired style. Perfect between protective styles.","dur":"1 hr","price":"From $90","badge":"Refresh","e":"💧","p":"ph3","goals":["shampoo","sleek","natural"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["women","men"]},
    {"n":"Shampoo & Blow Dry","d":"Clarifying shampoo, conditioning and blow dry. Ideal between protective styles or before your next one.","dur":"50 min","price":"From $45","badge":"Refresh","e":"💧","p":"ph3","goals":["shampoo","natural"],"tx":["wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["women","men"]},
  {"n":"Chemical Relaxer","d":"Straighten curly and coiled hair using professional chemical relaxer.","dur":"25 min+","price":"From $45","badge":"Chemical","e":"🧪","p":"ph1","goals":["chemical"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women"],"disclaimer":true,"chem":["relaxer"]},
    {"n":"Chemical Perm","d":"Classic rod-set perm, defined curls or waves via traditional texture service.","dur":"1.5 hrs+","price":"From $80","badge":"Chemical","e":"🧪","p":"ph1","goals":["chemical"],"tx":["straight","wavy"],"ls":["moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women"],"disclaimer":true,"chem":["perm"]},
    {"n":"Color (Loose Hair)","d":"Professional hair color on loose hair, single process, highlights, or toning.","dur":"35 min+","price":"From $75","badge":"Color","e":"🎨","p":"ph1","goals":["chemical"],"tx":["straight","wavy","curly","coily"],"ls":["moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women"],"chem":["color"]},
    {"n":"Starter Locs","d":"Begin your loc journey. We choose the best method for your texture and length, palm roll, two-strand start, or interlock.","dur":"3 to 5 hrs","price":"Consult req.","badge":"Journey","e":"🔱","p":"ph4","goals":["locs"],"tx":["coily","curly"],"ls":["minimal","moderate","invested"],"in":["keep","add"],"len":["twa","short","medium","long"],"gender":["women","men"],"loc":["starting"]},
    {"n":"Instant Locs","d":"Skip the budding stage. A needle crochets hair for an instant lock-and-hold. Wash & condition included.","dur":"4 hrs","price":"Starting at $500","badge":"Instant","e":"🔱","p":"ph4","goals":["locs"],"tx":["coily","curly","wavy"],"ls":["moderate","invested"],"in":["keep","add"],"len":["short","medium","long"],"gender":["women","men"],"loc":["starting"]},
    {"n":"Loc Retwist","d":"Keep locs neat, defined, and thriving with a traditional palm-roll retwist. Foundation of loc care.","dur":"1.5 to 3 hrs","price":"From $65","badge":"Maintenance","e":"🔱","p":"ph4","goals":["locs"],"tx":["locs"],"ls":["minimal","moderate"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["women","men"],"loc":["maintenance"],"lasts":"retwist every 4 to 6 weeks"},
    {"n":"Interlocking","d":"Long-lasting loc maintenance using interlocking instead of palm rolling. Ideal if you swim or work out often.","dur":"2 to 4 hrs","price":"From $85","badge":"Maintenance","e":"🔱","p":"ph4","goals":["locs"],"tx":["locs"],"ls":["minimal","moderate"],"in":["keep"],"len":["short","medium","long"],"gender":["women","men"],"loc":["maintenance"]},
    {"n":"Loc Moisturizing Treatment","d":"Deep hydration for dry or neglected locs, restores moisture, softness, and shine.","dur":"1 to 1.5 hrs","price":"From $50","badge":"Restore","e":"💧","p":"ph5","goals":["locs","scalp"],"tx":["locs"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["women","men"],"loc":["maintenance","repair"]},
    {"n":"Loc Styling","d":"Your locs, elevated, updo, pinned, wrapped, or braided designs for events or everyday.","dur":"1.5 to 2.5 hrs","price":"From $90","badge":"Style","e":"✨","p":"ph4","goals":["locs","occasion"],"tx":["locs"],"ls":["moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women","men"],"loc":["styling"]},
    {"n":"Loc Repair & Combine","d":"Rebuild thinning locs, combine, reinforce weak points, keep your locs thriving.","dur":"2 to 4 hrs","price":"Consult req.","badge":"Repair","e":"🛠️","p":"ph4","goals":["locs"],"tx":["locs"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women","men"],"loc":["repair"]},
    {"n":"Loc Extensions","d":"Add length or fullness to your existing locs with expert extension techniques.","dur":"4 to 6 hrs","price":"Consult req.","badge":"Length","e":"➕","p":"ph4","goals":["locs"],"tx":["locs"],"ls":["moderate","invested"],"in":["add"],"len":["short","medium","long"],"gender":["women","men"],"loc":["extensions"]},
    {"n":"Freeform Locs","d":"Transitioning to organic, free-growing locs. We consult on the switch and support your hair health along the way.","dur":"1 to 2 hrs","price":"Consult req.","badge":"Organic","e":"🌿","p":"ph4","goals":["locs","natural"],"tx":["locs","coily","curly"],"ls":["minimal"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["women","men"],"loc":["freeform"]},
    {"n":"Loc Color","d":"Highlights, full color, or toning on existing locs. Consultation required before service.","dur":"3 to 5 hrs","price":"Consult req.","badge":"Color","e":"🎨","p":"ph4","goals":["locs"],"tx":["locs"],"ls":["moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["women","men"],"loc":["color"],"disclaimer":true},
    {"n":"Hair Health Consultation","d":"A stylist looks at thinning, breakage, edges or shedding with you and builds your plan. Start here if your hair is struggling.","dur":"20 min","price":"Consult","badge":"Health","e":"🌱","p":"ph5","goals":["health"],"tx":["straight","wavy","curly","coily","locs"],"ls":["minimal","moderate","invested"],"in":["add","keep","cut"],"len":["twa","short","medium","long"],"gender":["women","men"]},
    {"n":"Deep Conditioning Treatment","d":"Moisture and strength for dry, brittle or damaged hair. Add it to any service.","dur":"30 min","price":"Add-on","badge":"Add-on","e":"💧","p":"ph5","goals":["health","scalp"],"tx":["straight","wavy","curly","coily","locs"],"ls":["minimal","moderate","invested"],"in":["add","keep","cut"],"len":["twa","short","medium","long"],"gender":["women","men"]},
    {"n":"Olaplex Treatment","d":"Repairs hair damaged by heat, color or chemicals. Add it to any service.","dur":"30 min","price":"Add-on","badge":"Add-on","e":"💧","p":"ph5","goals":["health"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["add","keep","cut"],"len":["short","medium","long"],"gender":["women","men"]},
    {"n":"Scalp Detox & Steam","d":"Removes buildup, soothes irritation, rebalances your scalp. Works at any length.","dur":"1 to 1.5 hrs","price":"From $60","badge":"Restore","e":"💧","p":"ph5","goals":["scalp","natural"],"tx":["straight","wavy","curly","coily","locs"],"ls":["minimal","moderate","invested"],"in":["add","keep","cut"],"len":["twa","short","medium","long"],"gender":["women","men"]},
    {"n":"Hot Towel Treatment","d":"Warm towel therapy to open pores, soothe scalp, and prep for any service. Add-on or standalone.","dur":"20 to 30 min","price":"From $20","badge":"Add-on","e":"♨️","p":"ph5","goals":["scalp","barber","beard"],"tx":["straight","wavy","curly","coily","locs"],"ls":["minimal","moderate","invested"],"in":["keep","cut"],"len":["twa","short","medium","long"],"gender":["women","men"]},
    {"n":"Barber Cut & Fade","d":"Precision fade, taper, or shape, any level, any guard. Crisp every time.","dur":"45 min to 1 hr","price":"From $40","badge":"Cut","e":"💈","p":"ph7","goals":["barber","cut"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["cut"],"len":["twa","short","medium","long"],"gender":["men"],"lenBest":["twa","short","medium"]},
    {"n":"Line-up & Beard Sculpt","d":"Crisp hairline and clean beard shape, the finishing touch that makes any cut land.","dur":"30 to 45 min","price":"From $25","badge":"Line-up","e":"🧔🏾","p":"ph7","goals":["beard","barber"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["cut","keep"],"len":["twa","short","medium","long"],"gender":["men"]},
    {"n":"Men's Cornrows & Braids","d":"Custom cornrows or braids built for you, classic straight-back to intricate designs.","dur":"2 to 3 hrs","price":"From $95","badge":"Braids","e":"🌿","p":"ph2","goals":["braids_m"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add","keep"],"len":["short","medium","long"],"gender":["men"]},
    {"n":"Men's Natural Styling","d":"Wash-and-go, twist-out, braid-out, or defined curls shaped to you. No chemicals.","dur":"1 to 1.5 hrs","price":"From $55","badge":"Natural","e":"🌀","p":"ph3","goals":["natural","cut"],"tx":["curly","coily","wavy"],"ls":["moderate","invested"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["men"]},
    {"n":"Men's Silk Press","d":"Heat-smooth straight style, no chemicals. For men with medium to long natural hair.","dur":"1.5 to 2 hrs","price":"From $75","badge":"Press","e":"✨","p":"ph1","goals":["sleek","natural"],"tx":["curly","coily","wavy"],"ls":["moderate","invested"],"in":["keep"],"len":["medium","long"],"gender":["men"],"lasts":"until your next wash"},
    {"n":"Tiny Heirs Wash & Style","d":"Gentle shampoo, condition, and style, soft hands, calm pace.","dur":"1 to 1.5 hrs","price":"From $35","badge":"Wash & Style","e":"🌱","p":"ph6","goals":["kids"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["keep"],"len":["twa","short","medium","long"],"gender":["tiny"],"age":["toddler","child","teen"],"childGender":["girl","boy"],"need":["style","natural"]},
    {"n":"Tiny Heirs Braids & Twists","d":"Age-appropriate protective braiding or twists, gentle tension, comfortable sessions.","dur":"2 to 3 hrs","price":"From $75","badge":"Protective","e":"🌱","p":"ph2","goals":["kids"],"tx":["curly","coily","wavy"],"ls":["minimal","moderate"],"in":["add","keep"],"len":["short","medium","long"],"gender":["tiny"],"age":["toddler","child","teen"],"childGender":["girl","boy"],"need":["style"]},
    {"n":"Tiny Heirs First Cut","d":"Their very first haircut, celebrated, calm, with photo keepsakes if you want.","dur":"30 to 45 min","price":"From $30","badge":"First Cut","e":"🌱","p":"ph7","goals":["kids"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["cut"],"len":["twa","short","medium"],"gender":["tiny"],"age":["toddler"],"childGender":["girl","boy"],"need":["trim"]},
    {"n":"Tiny Heirs Shape-Up & Line-up","d":"Fresh cut, taper, or clean line-up for boys, kid-pace, crisp result.","dur":"30 to 45 min","price":"From $30","badge":"Shape-Up","e":"💈","p":"ph7","goals":["kids"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["cut"],"len":["twa","short","medium"],"gender":["tiny"],"age":["child","teen"],"childGender":["boy"],"need":["trim"]},
    {"n":"Tiny Heirs Trim & Shape","d":"Trim to keep length healthy or shape for a fresh look. Gentle and confidence-building.","dur":"30 to 45 min","price":"From $35","badge":"Trim","e":"✂️","p":"ph7","goals":["kids"],"tx":["straight","wavy","curly","coily"],"ls":["minimal","moderate","invested"],"in":["cut"],"len":["short","medium","long"],"gender":["tiny"],"age":["child","teen"],"childGender":["girl","boy"],"need":["trim"]},
    {"n":"Tiny Heirs Natural Care","d":"Wash, deep condition, detangle, and twist-out or curl definition, teaching curl care.","dur":"1 to 1.5 hrs","price":"From $45","badge":"Natural","e":"🌀","p":"ph3","goals":["kids"],"tx":["curly","coily","wavy"],"ls":["moderate","invested"],"in":["keep"],"len":["short","medium","long"],"gender":["tiny"],"age":["toddler","child","teen"],"childGender":["girl","boy"],"need":["natural"]},
    {"n":"Tiny Heirs Loc Maintenance","d":"Gentle retwist or loc care adapted for little heads. Calm, quick sessions.","dur":"1 to 1.5 hrs","price":"From $50","badge":"Locs","e":"🔱","p":"ph4","goals":["kids"],"tx":["locs","coily","curly"],"ls":["minimal","moderate"],"in":["keep"],"len":["short","medium","long"],"gender":["tiny"],"age":["child","teen"],"childGender":["girl","boy"],"need":["locs"]}
  ];

  const LENGTHS = ['twa', 'short', 'medium', 'long'];
  const LENGTH_WORDS = { twa: 'very short', short: 'short', medium: 'medium', long: 'long' };
  const TEXTURES = ['straight', 'transitioning', 'wavy', 'curly', 'coily', 'locs'];
  const TEXTURE_WORDS = { straight: 'straight or relaxed', transitioning: 'transitioning', wavy: 'wavy', curly: 'curly', coily: 'coily', locs: 'loc\'d' };
  const BRANCHES = {
    locs:     { key: 'loc',     options: ['starting', 'maintenance', 'styling', 'repair', 'extensions', 'freeform', 'color'] },
    chemical: { key: 'chem',    options: ['relaxer', 'perm', 'color'] },
    protect:  { key: 'protect', options: ['individual', 'natural-braids', 'natural-styles'] }
  };

  // Which textures each service suits best. Texture already filters out what
  // doesn't fit; this puts what fits best first (and says so on the card).
  const TX_BEST = {
    'Knotless Braids': ['coily', 'curly', 'transitioning'], 'Senegalese / Box Twists': ['coily'], 'Feed-In Style Braids': ['coily', 'curly'],
    'Faux Locs — Butterfly': ['coily'], 'Faux Locs — Soft': ['coily'], 'Mini Twists w/ Added Hair': ['coily'],
    'Natural Hair Braiding': ['coily', 'curly'], 'Mini Twists (Two Strands)': ['coily', 'transitioning'],
    'Curl Definition + Restoration': ['curly', 'wavy', 'transitioning'], 'Natural Hair Styling': ['coily'], 'Shampoo & Blow Dry': ['coily', 'curly', 'transitioning'],
    'Sew-In Weave Installation': ['straight', 'transitioning'], 'Partial Sew-In': ['straight'], 'Quick Weave': ['straight', 'transitioning'],
    'Crochet Styles': ['coily', 'curly', 'transitioning'], 'Hair Extensions': ['straight', 'wavy'],
    'Silk Press': ['coily', 'curly'], 'Keratin Smoothing Treatment': ['curly', 'wavy'], 'Sleek Ponytail': ['straight', 'wavy'], 'Shampoo & Style': ['straight'],
    'Pixie & Tapered Cut': ['straight', 'coily'], 'Shape Up & Trim': ['transitioning', 'straight'],
    'Deep Conditioning Treatment': ['coily', 'transitioning'], 'Olaplex Treatment': ['straight', 'transitioning'],
    'Hair Health Consultation': ['transitioning'], 'Chemical Relaxer': ['coily'], 'Chemical Perm': ['straight'],
    'Color (Loose Hair)': ['straight', 'wavy'], 'Scalp Detox & Steam': ['coily', 'locs'], 'Hot Towel Treatment': ['coily'],
    'Barber Cut & Fade': ['coily', 'curly'], 'Line-up & Beard Sculpt': ['coily'], "Men's Cornrows & Braids": ['coily', 'curly'],
    "Men's Natural Styling": ['coily', 'curly'], "Men's Silk Press": ['curly', 'coily'],
    'Starter Locs': ['coily'], 'Instant Locs': ['curly', 'wavy'], 'Updo & Special Occasion': ['straight', 'curly']
  };
  for (const s of SVCS) if (TX_BEST[s.n]) s.txBest = TX_BEST[s.n];

  // Transitioning hair (relaxed ends, natural roots) can have what curly and
  // coily hair can, except a relaxer or a perm, which would undo the transition.
  for (const s of SVCS) {
    const chem = s.chem && (s.chem.includes('relaxer') || s.chem.includes('perm'));
    if (!s.tx.includes('transitioning') && (s.tx.includes('curly') || s.tx.includes('coily')) && !chem) s.tx.push('transitioning');
  }

  function intentOK(s, intent) {
    if (!intent || intent === 'any') return true;
    if (intent === 'add') return s.in.includes('add') || s.in.includes('keep');
    return s.in.includes(intent);
  }

  // How much a service answers the chosen goals, honoring branch picks.
  function goalCredit(s, p) {
    const goals = p.goals || [];
    if (s.loc && !goals.includes('locs')) return 0;       // loc services live in the loc lane
    if (s.chem && !goals.includes('chemical')) return 0;  // chemical services live in the chemical lane
    let credit = 0;
    for (const g of goals) {
      if (!s.goals.includes(g)) continue;
      if (g === 'locs' && !(s.loc && s.loc.includes(p.branches && p.branches.locs))) continue;
      if (g === 'chemical' && !(s.chem && s.chem.includes(p.branches && p.branches.chemical))) continue;
      if (g === 'protect' && !(s.protect && s.protect.includes(p.branches && p.branches.protect))) continue;
      credit++;
    }
    return credit;
  }

  /**
   * Ranked services for a profile:
   * { gender, len, texture, intent, goals:[..], branches:{locs,chemical,protect}, lifestyle }
   */
  function match(p, limit) {
    const out = [];
    SVCS.forEach((s, order) => {
      if (!s.gender.includes(p.gender)) return;
      if (p.len && !s.len.includes(p.len)) return;
      if (p.texture && !s.tx.includes(p.texture)) return;
      if (!intentOK(s, p.intent)) return;
      const credit = goalCredit(s, p);
      if (!credit) return;
      let score = credit * 4;
      if ((p.goals || []).includes(s.goals[0])) score += 2;        // it's what this service is for
      if (s.lenBest && s.lenBest.includes(p.len)) score += 1;
      if (s.txBest && s.txBest.includes(p.texture)) score += 2;
      if (p.lifestyle && s.ls.includes(p.lifestyle)) score += 1;
      out.push({ s, score, order });
    });
    out.sort((a, b) => b.score - a.score || a.order - b.order);
    return out.slice(0, limit || 6).map(x => x.s);
  }

  // Does this goal lead anywhere for this client? Goals with branches count
  // as available when at least one branch does.
  function branchAvailable(p, goal, branch) {
    return match({ ...p, goals: [goal], branches: { ...(p.branches || {}), [goal]: branch } }, 1).length > 0;
  }
  function goalAvailable(p, goal) {
    const b = BRANCHES[goal];
    if (b) return b.options.some(o => branchAvailable(p, goal, o));
    return match({ ...p, goals: [goal] }, 1).length > 0;
  }
  function goalsFor(p) {
    return GOALS.filter(g => g.gender.includes(p.gender)).map(g => ({ goal: g, available: goalAvailable(p, g.id) }));
  }

  // One line on each card saying why it fits.
  function whyLine(s, p) {
    const bits = [];
    if (p.len) bits.push('Fits ' + LENGTH_WORDS[p.len] + ' hair');
    if (p.texture && p.texture !== 'locs' && s.txBest && s.txBest.includes(p.texture)) bits.push('great for ' + TEXTURE_WORDS[p.texture] + ' texture');
    if (s.in.includes('add') && !s.in.includes('keep')) bits.push('uses added hair');
    else if (s.goals.some(g => ['protect', 'natural'].includes(g)) && s.in.includes('keep')) bits.push('your own hair, no extensions');
    if (s.lasts) bits.push(/^retwist/.test(s.lasts) ? s.lasts : 'lasts ' + s.lasts);
    return bits.join(' · ');
  }

  // The consultation that fits a lane, for when a client should talk first.
  function consultFor(p) {
    const g = p.goals || [];
    if (g.includes('locs') || p.texture === 'locs') return 'Loc Consultation';
    if (g.includes('chemical')) return 'Color Consultation';
    if (g.includes('protect') || g.includes('weave') || g.includes('braids_m')) return 'Braiding Consultation';
    if (g.includes('natural') || g.includes('health') || ['curly', 'coily', 'transitioning'].includes(p.texture)) return 'Curly Hair Consultation';
    return 'General Consultation';
  }

  const api = { GOALS, SVCS, LENGTHS, TEXTURES, BRANCHES, match, goalAvailable, branchAvailable, goalsFor, whyLine, consultFor, intentOK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FINDER = api;
})(typeof window !== 'undefined' ? window : globalThis);
