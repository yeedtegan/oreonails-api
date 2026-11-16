// Seed data for the Oreo Nails database. Run `npm run seed` to reset the DB with it.

export type Pattern =
  | "solid"
  | "french"
  | "dots"
  | "stripes"
  | "stars"
  | "plaid"
  | "ombre"
  | "hearts"
  | "flowers"
  | "leopard"
  | "chrome"
  | "lights";

export type ProductType = "set" | "bundle" | "tool";

export interface Product {
  handle: string;
  title: string;
  type: ProductType;
  price: number;
  compareAt?: number;
  collections: string[];
  palette: [string, string, string, string]; // background, base, accent, detail
  pattern: Pattern;
  shape: string;
  rating: number;
  reviewCount: number;
  description: string;
  setsIncluded?: number;
  rank: number; // best-seller rank (lower = better)
  added: number; // higher = newer
}

export interface Collection {
  handle: string;
  title: string;
  description: string;
  group: "shop" | "collection" | "season" | "other";
  palette: [string, string, string, string];
  pattern: Pattern;
}

export const SITE = {
  name: "Oreo Nails",
  tagline: "Press-on nails hand-painted to order in our studio.",
  email: "hello@oreonails.com",
  whatsapp: "+84 900 000 000",
  hours: "9 AM – 5 PM (GMT+7), Monday – Saturday",
  address: "123 Example Street, Hanoi, Vietnam",
  freeShippingThreshold: 69,
  shippingFee: 5.99,
  welcomeCode: "WELCOME10",
  welcomePercent: 10,
  socials: {
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/",
    facebook: "https://facebook.com/",
    pinterest: "https://pinterest.com/",
    youtube: "https://youtube.com/",
  },
};

/** Mix-and-match promo: when the cart holds `min` nail sets, the `free` cheapest ones are free. */
export const PROMO_TIERS = [
  { buy: 2, get: 1 },
  { buy: 3, get: 2 },
  { buy: 5, get: 3 },
];

export const SIZES = ["XS", "S", "M", "L", "Custom"] as const;
export const SHAPES = ["Almond", "Coffin", "Square", "Oval", "Stiletto"] as const;

export const COLLECTIONS: Collection[] = [
  { handle: "shop-all", title: "All Products", description: "Every hand-painted set we make.", group: "shop", palette: ["#f4ece4", "#1c1c1c", "#e8c7c1", "#ffffff"], pattern: "french" },
  { handle: "best-sellers", title: "Best Sellers", description: "The sets our customers keep coming back for.", group: "shop", palette: ["#f7e6e2", "#c0495f", "#f5d2d8", "#ffffff"], pattern: "hearts" },
  { handle: "new-arrivals", title: "Just Dropped", description: "Fresh designs straight from the studio.", group: "shop", palette: ["#e6eef7", "#5b7db1", "#c9d9ef", "#ffffff"], pattern: "chrome" },
  { handle: "sale", title: "Sale", description: "Limited-time markdowns on fan favourites.", group: "shop", palette: ["#fbe9d7", "#d8572a", "#f6c89f", "#ffffff"], pattern: "stripes" },
  { handle: "holiday-glam", title: "Holiday Glam", description: "New festive sets. Shop early.", group: "collection", palette: ["#f3e3e3", "#a3202b", "#2f6b3f", "#f2d27a"], pattern: "lights" },
  { handle: "cozy-fall", title: "Cozy Fall", description: "Warm hues, plaid and pumpkin spice.", group: "season", palette: ["#f2e4d4", "#9c4a1a", "#d99a4e", "#f6e7c8"], pattern: "plaid" },
  { handle: "winter-glam", title: "Winter Glam", description: "Icy chrome, snow and sparkle.", group: "season", palette: ["#e8f0f6", "#b7cde0", "#ffffff", "#7f9cb8"], pattern: "stars" },
  { handle: "spring-bloom", title: "Spring Bloom", description: "Soft petals and pastel florals.", group: "season", palette: ["#f4f0e6", "#f4b6c2", "#9ccc9c", "#ffffff"], pattern: "flowers" },
  { handle: "summer-glow", title: "Summer Glow", description: "Bright, juicy and sun-kissed.", group: "season", palette: ["#fff3dc", "#ff8a5b", "#ffd166", "#ffffff"], pattern: "ombre" },
  { handle: "star-signs", title: "Star Signs", description: "Celestial sets for every zodiac.", group: "collection", palette: ["#1d1b33", "#2e2a55", "#e7c76a", "#ffffff"], pattern: "stars" },
  { handle: "animal-print", title: "Animal Print", description: "Leopard, zebra and wild things.", group: "collection", palette: ["#f2e6d8", "#c99a62", "#3a2a1a", "#f2e6d8"], pattern: "leopard" },
  { handle: "polka-dots", title: "Polka Dots", description: "Playful dots in every colour.", group: "collection", palette: ["#fff0f3", "#ffffff", "#e35d8a", "#1c1c1c"], pattern: "dots" },
  { handle: "modern-french", title: "Modern French", description: "Clean tips with a twist.", group: "collection", palette: ["#f6efe9", "#f7dcd4", "#ffffff", "#1c1c1c"], pattern: "french" },
  { handle: "bridal-glam", title: "Bridal Glam", description: "Pearls, lace and something blue.", group: "collection", palette: ["#f7f4ef", "#fbf6f1", "#e9dccf", "#c7a97a"], pattern: "chrome" },
  { handle: "toenails", title: "Toenails", description: "Matching press-on sets for your toes.", group: "other", palette: ["#e9f3ef", "#4aa58a", "#bfe3d6", "#ffffff"], pattern: "solid" },
  { handle: "bundles", title: "Bundle Deals", description: "The ultimate choice, abundant offers.", group: "other", palette: ["#efe8f5", "#7b4fa3", "#d6c3e8", "#ffffff"], pattern: "dots" },
  { handle: "tools-accessories", title: "Tools & Accessories", description: "Essentials for a perfect, long-lasting wear.", group: "other", palette: ["#ededed", "#3b3b3b", "#bdbdbd", "#ffffff"], pattern: "solid" },
];

type Seed = Omit<Product, "rating" | "reviewCount" | "description" | "shape" | "rank" | "added"> &
  Partial<Pick<Product, "description" | "shape">>;

const seeds: Seed[] = [
  // Holiday
  { handle: "string-lights", title: "String Lights", type: "set", price: 34.99, collections: ["holiday-glam", "new-arrivals", "best-sellers"], palette: ["#f6e9e6", "#1f2a2e", "#e6394a", "#f2c14e"], pattern: "lights" },
  { handle: "fireside-mix", title: "Fireside Mix", type: "set", price: 34.99, collections: ["holiday-glam", "best-sellers"], palette: ["#f2e3dc", "#a3202b", "#2f5b3a", "#f7f1e6"], pattern: "plaid" },
  { handle: "gingerbread-lane", title: "Gingerbread Lane", type: "set", price: 36.89, compareAt: 40.99, collections: ["holiday-glam", "sale", "best-sellers"], palette: ["#f4e6d8", "#a8683a", "#ffffff", "#e6394a"], pattern: "dots" },
  { handle: "green-lights", title: "Green Lights", type: "set", price: 36.89, compareAt: 40.99, collections: ["holiday-glam", "sale"], palette: ["#e6efe6", "#2f5b3a", "#f2c14e", "#e6394a"], pattern: "lights" },
  { handle: "festive-sprinkle", title: "Festive Sprinkle", type: "set", price: 31.99, collections: ["holiday-glam", "new-arrivals"], palette: ["#fbeff0", "#f7d4da", "#c0392b", "#2e7d32"], pattern: "dots" },
  { handle: "mint-baubles", title: "Mint Baubles", type: "set", price: 31.99, collections: ["holiday-glam", "winter-glam"], palette: ["#e8f5f0", "#a8dcc8", "#ffffff", "#d4a84f"], pattern: "chrome" },
  { handle: "noel-surprise", title: "Noel Surprise", type: "set", price: 31.99, collections: ["holiday-glam", "new-arrivals"], palette: ["#f5e8e8", "#ffffff", "#c0392b", "#2e7d32"], pattern: "stripes" },
  { handle: "gingerbread-lace", title: "Gingerbread Lace", type: "set", price: 31.99, collections: ["holiday-glam"], palette: ["#f3e6da", "#b77a4b", "#ffffff", "#ffffff"], pattern: "french" },
  // Fall
  { handle: "fall-market", title: "Fall Market", type: "set", price: 31.49, compareAt: 34.99, collections: ["cozy-fall", "best-sellers", "sale"], palette: ["#f4e5d3", "#b5541c", "#e3a857", "#5b3a1e"], pattern: "plaid" },
  { handle: "choco-bloom", title: "Choco Bloom", type: "set", price: 28.79, compareAt: 31.99, collections: ["cozy-fall", "best-sellers", "sale"], palette: ["#efe2d8", "#5a3a2a", "#f1c5b5", "#ffffff"], pattern: "flowers" },
  { handle: "maple-ombre", title: "Maple Ombré", type: "set", price: 29.99, collections: ["cozy-fall"], palette: ["#f6e8d9", "#8c2f1b", "#f0a35e", "#ffffff"], pattern: "ombre" },
  { handle: "dallas-cowgirl", title: "Dallas Cowgirl", type: "set", price: 34.99, collections: ["cozy-fall", "best-sellers", "animal-print"], palette: ["#f1e3d3", "#c78f5a", "#3a2a1a", "#ffffff"], pattern: "leopard" },
  // Celestial / winter
  { handle: "midnight-star", title: "Midnight Star", type: "set", price: 31.49, compareAt: 34.99, collections: ["star-signs", "best-sellers", "sale", "winter-glam"], palette: ["#1d1b33", "#232046", "#e7c76a", "#ffffff"], pattern: "stars" },
  { handle: "aries-flame", title: "Aries Flame", type: "set", price: 32.99, collections: ["star-signs", "new-arrivals"], palette: ["#2a1830", "#7d1f2b", "#f2a65a", "#ffffff"], pattern: "stars" },
  { handle: "pisces-tide", title: "Pisces Tide", type: "set", price: 32.99, collections: ["star-signs"], palette: ["#14243a", "#2d5b8a", "#9bd1e5", "#ffffff"], pattern: "ombre" },
  { handle: "snow-globe", title: "Snow Globe", type: "set", price: 33.99, collections: ["winter-glam", "new-arrivals"], palette: ["#e8f0f6", "#c5d8ea", "#ffffff", "#8aa7c4"], pattern: "dots" },
  { handle: "ice-queen", title: "Ice Queen", type: "set", price: 35.99, collections: ["winter-glam", "bridal-glam"], palette: ["#eef3f8", "#dfe9f3", "#ffffff", "#9fb7cf"], pattern: "chrome" },
  // Spring / summer / misc
  { handle: "petal-aura", title: "Petal Aura", type: "set", price: 31.99, collections: ["spring-bloom", "best-sellers"], palette: ["#f8eef0", "#f6c9d3", "#ffffff", "#9ccc9c"], pattern: "flowers" },
  { handle: "cherry-kiss", title: "Cherry Kiss", type: "set", price: 29.99, collections: ["summer-glow", "polka-dots"], palette: ["#fff0f0", "#ffffff", "#d7263d", "#2e7d32"], pattern: "hearts" },
  { handle: "citrus-pop", title: "Citrus Pop", type: "set", price: 28.99, collections: ["summer-glow"], palette: ["#fff6e0", "#ffb347", "#ffe66d", "#ffffff"], pattern: "ombre" },
  { handle: "polka-party", title: "Polka Party", type: "set", price: 27.99, collections: ["polka-dots", "new-arrivals"], palette: ["#fff0f5", "#1c1c1c", "#ffffff", "#ffffff"], pattern: "dots" },
  { handle: "classic-french", title: "Classic French", type: "set", price: 26.99, collections: ["modern-french", "bridal-glam", "best-sellers"], palette: ["#f6efe9", "#f6dcd3", "#ffffff", "#ffffff"], pattern: "french" },
  { handle: "noir-french", title: "Noir French", type: "set", price: 27.99, collections: ["modern-french"], palette: ["#eeeae6", "#f2ddd5", "#1c1c1c", "#ffffff"], pattern: "french" },
  { handle: "pearl-vows", title: "Pearl Vows", type: "set", price: 38.99, collections: ["bridal-glam"], palette: ["#f7f4ef", "#fbf4ec", "#ffffff", "#d9c3a3"], pattern: "dots" },
  { handle: "wild-leopard", title: "Wild Leopard", type: "set", price: 30.99, compareAt: 34.99, collections: ["animal-print", "sale"], palette: ["#f3e6d6", "#d2a26b", "#2d1f12", "#ffffff"], pattern: "leopard" },
  { handle: "oreo-cream", title: "Oreo Cream", type: "set", price: 29.99, collections: ["modern-french", "new-arrivals", "best-sellers"], palette: ["#f2efe9", "#1c1c1c", "#ffffff", "#ffffff"], pattern: "stripes" },
  // Toenails
  { handle: "mint-toes", title: "Mint Toes", type: "set", price: 19.99, collections: ["toenails", "new-arrivals"], palette: ["#e9f3ef", "#7fcbb0", "#ffffff", "#ffffff"], pattern: "solid", shape: "Square" },
  { handle: "holiday-toes", title: "Holiday Toes", type: "set", price: 21.99, collections: ["toenails", "holiday-glam"], palette: ["#f6e9e6", "#c0392b", "#ffffff", "#2e7d32"], pattern: "stripes", shape: "Square" },
  // Bundles
  { handle: "confetti-closet-bundle", title: "Confetti Closet (9 sets)", type: "bundle", price: 189.99, compareAt: 260.91, setsIncluded: 9, collections: ["bundles", "holiday-glam"], palette: ["#f6eaf1", "#e35d8a", "#f2c14e", "#2e7d32"], pattern: "dots" },
  { handle: "frosted-dreams-bundle", title: "Frosted Dreams (6 sets)", type: "bundle", price: 139.99, compareAt: 215.94, setsIncluded: 6, collections: ["bundles", "winter-glam"], palette: ["#e8f0f6", "#b7cde0", "#ffffff", "#7f9cb8"], pattern: "stars" },
  { handle: "festive-french-bundle", title: "Festive French (9 sets)", type: "bundle", price: 139.99, compareAt: 217.91, setsIncluded: 9, collections: ["bundles", "modern-french"], palette: ["#f6efe9", "#f6dcd3", "#c0392b", "#ffffff"], pattern: "french" },
  { handle: "cozy-stories-bundle", title: "Cozy Stories (9 sets)", type: "bundle", price: 179.99, compareAt: 287.91, setsIncluded: 9, collections: ["bundles", "cozy-fall"], palette: ["#f2e4d4", "#9c4a1a", "#d99a4e", "#f6e7c8"], pattern: "plaid" },
  // Tools
  { handle: "glue-pro-kit", title: "3-in-1 Nail Glue Pro Kit", type: "tool", price: 24.95, compareAt: 34.95, collections: ["tools-accessories"], palette: ["#ededed", "#3b3b3b", "#e8c7c1", "#ffffff"], pattern: "solid", description: "Brush-on glue, nail prep dehydrator and primer in one kit for the longest possible wear." },
  { handle: "cuticle-oil-pen", title: "Cuticle Oil Pen", type: "tool", price: 7.99, compareAt: 10.95, collections: ["tools-accessories"], palette: ["#f4ece4", "#c7a97a", "#ffffff", "#ffffff"], pattern: "solid", description: "Nourishing click-pen cuticle oil. Keeps nail beds healthy between wears." },
  { handle: "sticky-tabs-pack", title: "Adhesive Tabs Pack", type: "tool", price: 6.95, compareAt: 10.95, collections: ["tools-accessories"], palette: ["#eef3f8", "#9fb7cf", "#ffffff", "#ffffff"], pattern: "solid", description: "10 sheets of jelly adhesive tabs for short, damage-free wear." },
  { handle: "magic-remover", title: "Magic Remover", type: "tool", price: 14.95, compareAt: 24.95, collections: ["tools-accessories"], palette: ["#efe8f5", "#7b4fa3", "#ffffff", "#ffffff"], pattern: "solid", description: "Gentle remover that releases glue in minutes without soaking in acetone." },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const PRODUCTS: Product[] = seeds.map((s, i) => {
  const h = hash(s.handle);
  const shapes = ["Almond", "Coffin", "Square", "Oval", "Stiletto"];
  return {
    ...s,
    collections: s.type === "tool" ? s.collections : ["shop-all", ...s.collections],
    shape: s.shape ?? shapes[h % shapes.length],
    rating: 4.5 + ((h % 50) / 100),
    reviewCount: 12 + (h % 240),
    description:
      s.description ??
      (s.type === "bundle"
        ? `A curated bundle of ${s.setsIncluded} hand-painted sets — save big versus buying individually. Each set comes in your size with a full application kit.`
        : `${s.title} is hand-painted by our artists with gel, cured under UV/LED and sealed with a glossy top coat. Wears 2–4 weeks and can be reused 5–10 times.`),
    rank: s.collections.includes("best-sellers") ? i : 100 + i,
    added: s.collections.includes("new-arrivals") ? 1000 + i : i,
  };
});

export const getProduct = (handle: string) => PRODUCTS.find((p) => p.handle === handle);
export const getCollection = (handle: string) => COLLECTIONS.find((c) => c.handle === handle);
export const productsIn = (handle: string) => {
  const list = PRODUCTS.filter((p) => p.collections.includes(handle));
  return handle === "best-sellers" ? [...list].sort((a, b) => a.rank - b.rank) : list;
};

export const SETS_INCLUDED = [
  "10 hand-painted nails in your size (24 for Custom)",
  "Nail glue",
  "2 sheets of adhesive tabs",
  "2 alcohol prep pads",
  "Cuticle pusher",
  "Mini nail file",
];

export const SIZE_CHART: { size: string; mm: [number, number, number, number, number] }[] = [
  { size: "XS", mm: [14, 10, 11, 10, 7] },
  { size: "S", mm: [15, 11, 12, 10, 8] },
  { size: "M", mm: [16, 12, 13, 11, 9] },
  { size: "L", mm: [17, 13, 14, 12, 10] },
];

export const FAQ_CATEGORIES = ["About Oreo Nails & Our Craft", "Application & Wear", "Sizing & Fit", "Care & Reuse", "Custom & Bespoke", "Shipping, Returns & Wholesale"];

// The first six (homepage) keep their original order; `category` groups them on the FAQ page.
export const FAQS: { q: string; a: string; category: string }[] = [
  { q: "How long do press-on nails last?", a: "With glue, each wear lasts 2–4 weeks. With adhesive tabs, 1–3 days. A set can be reused 5–10 times with proper care.", category: "Application & Wear" },
  { q: "Can I wash my hands or shower?", a: "Yes. Just avoid soaking in hot water for long periods and wear gloves for harsh chemicals.", category: "Application & Wear" },
  { q: "Will they damage my natural nails?", a: "No. Our tabs and salon-grade glue are gentle, and removal with warm soapy water or our Magic Remover is damage-free.", category: "Care & Reuse" },
  { q: "What if they don't fit?", a: "Use our free sizing guide. If you're between sizes, pick the larger one. You can also choose Custom size and enter your measurements. Size exchanges are free within 30 days.", category: "Sizing & Fit" },
  { q: "What's included in each set?", a: SETS_INCLUDED.join(", ") + ".", category: "About Oreo Nails & Our Craft" },
  { q: "Can I request a custom design?", a: "Absolutely — send us your idea, mood board or event inspiration through our Custom Nail Service and we'll paint a set just for you.", category: "Custom & Bespoke" },
  { q: "How long does shipping take?", a: "Each set is made to order in 2–4 business days, then ships in 5–10 business days. Orders over $69 ship free.", category: "Shipping, Returns & Wholesale" },
  { q: "Are your press-on nails really hand-painted?", a: "Yes. Every nail is painted by hand by our artists with gel, cured under UV/LED light and sealed with a top coat. Nothing is printed.", category: "About Oreo Nails & Our Craft" },
  { q: "What materials do you use?", a: "Durable ABS tips, professional gel colour and a glossy or matte gel top coat — the same products used in salons.", category: "About Oreo Nails & Our Craft" },
  { q: "How long does each set take to create?", a: "A typical set takes 2–4 hours of hands-on painting, which is why we make each order to order.", category: "About Oreo Nails & Our Craft" },
  { q: "Glue or adhesive tabs — which should I use?", a: "Use tabs for a weekend or a single event (1–3 days). Use glue for 2–4 weeks of wear. You can start with tabs to test the fit.", category: "Application & Wear" },
  { q: "How do I make them last longer?", a: "Push back cuticles, buff lightly, wipe with alcohol, then press each nail for 30 seconds. Avoid water for the first hour.", category: "Application & Wear" },
  { q: "How do I measure my nails?", a: "Lay flexible tape (or a strip of paper) across the widest part of each nail bed and read the width in millimetres. Our Size Guide has a calculator.", category: "Sizing & Fit" },
  { q: "I'm between two sizes. Which should I pick?", a: "Size up. A slightly wide tip can be filed down; a narrow one lifts at the sides.", category: "Sizing & Fit" },
  { q: "How do I remove and reuse a set?", a: "Soak fingertips in warm soapy water with a little oil for 10–15 minutes, lift gently from the side, then clean off old glue and store the nails in their box.", category: "Care & Reuse" },
  { q: "How much does a custom set cost?", a: "Custom commissions have no extra fee and include up to 3 rounds of design approval.", category: "Custom & Bespoke" },
  { q: "Can I return or exchange my order?", a: "Unworn sets can be returned within 30 days. Size exchanges are free within 30 days. Custom orders are remade if defective.", category: "Shipping, Returns & Wholesale" },
  { q: "Do you offer wholesale?", a: "Yes — salons and boutiques can email us for wholesale pricing and minimums.", category: "Shipping, Returns & Wholesale" },
];

export interface Article {
  slug: string;
  tags: string[];
  title: string;
  excerpt: string;
  date: string;
  palette: [string, string, string, string];
  pattern: Pattern;
  body: string[];
}

export const ARTICLES: Article[] = [
  {
    slug: "ugly-sweater-party-nails",
    tags: ["Nail Ideas","Seasonal"],
    title: "Ugly Sweater Party Nails: 7 Fun Press-On Looks",
    excerpt: "Knit textures, candy canes and kitschy plaid — our favourite looks for the silliest party of the season.",
    date: "2026-11-10",
    palette: ["#f2e3dc", "#a3202b", "#2f5b3a", "#f7f1e6"],
    pattern: "plaid",
    body: [
      "Ugly sweater parties are the one time of year when more is more. Your nails should get the memo too.",
      "1. Classic plaid — a red-and-green tartan instantly reads ‘holiday’. Try our Fireside Mix.",
      "2. Candy cane stripes — diagonal red and white stripes on a long almond shape.",
      "3. String lights — a dark base with tiny coloured bulbs is fun and surprisingly chic.",
      "4. Gingerbread — warm brown with white icing dots.",
      "5. Snowflake French — swap the white tip for a frosty blue and add a single snowflake accent.",
      "6. Mix-and-match — wear a different design on each finger. Nobody will complain.",
      "7. Glitter everything — when in doubt, add sparkle.",
    ],
  },
  {
    slug: "glue-or-tabs-quiz",
    tags: ["How-To","Comparison"],
    title: "Glue or Adhesive Tabs? A 30-Second Guide",
    excerpt: "Weekend wear or a month-long manicure? Here's how to pick the right application method.",
    date: "2026-10-28",
    palette: ["#e6eef7", "#5b7db1", "#c9d9ef", "#ffffff"],
    pattern: "chrome",
    body: [
      "Choosing between glue and tabs comes down to one question: how long do you want to wear your set?",
      "Choose adhesive tabs if you want a look for a single event or weekend. Tabs are quick, gentle and let you swap designs often.",
      "Choose glue if you want 2–4 weeks of wear. Prep is key: push back cuticles, buff lightly, wipe with alcohol, then apply.",
      "Pro tip: you can use tabs for the first wear to test your sizing, then switch to glue once you've found your favourite fit.",
    ],
  },
  {
    slug: "customer-reviews",
    tags: ["Reviews"],
    title: "Real Customers, Real Wear: What People Say",
    excerpt: "We rounded up honest feedback from customers on fit, wear time and reuse.",
    date: "2026-10-12",
    palette: ["#f7e6e2", "#c0495f", "#f5d2d8", "#ffffff"],
    pattern: "hearts",
    body: [
      "We asked customers how their sets held up after weeks of real life: typing, dishes, gym sessions and more.",
      "The most common praise was fit — customers who measured with our sizing guide almost never needed an exchange.",
      "Wear time averaged just under three weeks with glue, and many customers reported reusing a single set more than five times.",
      "The most common tip? Apply at night and avoid hot water for the first couple of hours.",
    ],
  },
  {
    slug: "how-to-make-press-ons-last",
    tags: ["How-To","Nail Care"],
    title: "How to Make Press-On Nails Last Longer",
    excerpt: "Five prep steps that double your wear time.",
    date: "2026-09-30",
    palette: ["#f4ece4", "#1c1c1c", "#e8c7c1", "#ffffff"],
    pattern: "french",
    body: [
      "1. Push back cuticles so the nail sits flush.",
      "2. Lightly buff the shine off your natural nail.",
      "3. Wipe every nail with an alcohol pad to remove oils.",
      "4. Apply a thin layer of glue to both surfaces and press at a 45° angle for 30 seconds.",
      "5. Avoid water for the first hour.",
    ],
  },
];

export interface Review {
  id: string;
  name: string;
  rating: number;
  title: string;
  body: string;
  product?: string;
  variant?: string;
  date: string;
}

export const REVIEWS: Review[] = [
  { id: "r1", name: "Mia T.", rating: 5, title: "Obsessed!", body: "Fit perfectly after using the sizing guide. Lasted three weeks with glue and still looked brand new.", product: "string-lights", variant: "M / Almond", date: "2026-11-08" },
  { id: "r2", name: "Anna L.", rating: 5, title: "Salon quality", body: "Everyone asked where I got my nails done. The detail on the painting is incredible.", product: "fall-market", variant: "S / Coffin", date: "2026-11-02" },
  { id: "r3", name: "Riley K.", rating: 4, title: "Gorgeous, a bit long", body: "Beautiful set. A little longer than I'm used to but I filed them down easily.", product: "midnight-star", variant: "M / Stiletto", date: "2026-10-29" },
  { id: "r4", name: "Ny P.", rating: 5, title: "Reused 6 times", body: "I've worn this set six times now with tabs and it still looks great.", product: "petal-aura", variant: "XS / Oval", date: "2026-10-20" },
  { id: "r5", name: "Kayla S.", rating: 5, title: "Wedding nails", body: "Ordered a custom set for my wedding. The team was so helpful through every revision.", product: "pearl-vows", variant: "Custom / Almond", date: "2026-10-15" },
  { id: "r6", name: "Jess M.", rating: 4, title: "Cute and sturdy", body: "Shipping took a bit but the quality is worth it. Will order again.", product: "choco-bloom", variant: "M / Square", date: "2026-10-01" },
  { id: "r7", name: "Hannah W.", rating: 5, title: "Best press-ons ever", body: "Thicker and sturdier than drugstore brands. Didn't lift once.", product: "classic-french", variant: "S / Almond", date: "2026-09-21" },
  { id: "r8", name: "Chloe D.", rating: 3, title: "Pretty but sizing", body: "Design is lovely. I should have measured — one size up next time.", product: "dallas-cowgirl", variant: "S / Coffin", date: "2026-09-12" },
];
