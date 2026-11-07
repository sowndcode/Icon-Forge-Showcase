// Automatic categories for imported icons: by what the file name says (keywords), by words the
// names share, or by main colour. Pure functions — the Import page previews the result first.

/** Category → words that point to it. Checked against the words of a file name, last word first
 *  ("evidence_bag" → bag → Containers), because the noun usually comes last. */
const KEYWORDS: [string, string[]][] = [
  ['Weapons', ['sword', 'blade', 'axe', 'bow', 'arrow', 'arrows', 'dagger', 'spear', 'gun', 'pistol', 'rifle', 'shotgun', 'bomb', 'grenade', 'knife', 'mace', 'katana', 'shuriken', 'ammo', 'bullet', 'bullets', 'crossbow', 'halberd', 'scythe', 'trident', 'dynamite', 'cannon', 'laser', 'blaster', 'weapon']],
  ['Armor & clothing', ['armor', 'armour', 'helmet', 'helm', 'shield', 'boot', 'boots', 'glove', 'gloves', 'gauntlet', 'hat', 'cap', 'scarf', 'cape', 'cloak', 'coat', 'jacket', 'shirt', 'pants', 'belt', 'mask', 'goggles', 'vest', 'hood', 'robe', 'shoe', 'shoes', 'moustache', 'mustache', 'tie', 'uniform', 'costume']],
  ['Jewelry & gems', ['ring', 'necklace', 'amulet', 'pendant', 'gem', 'gems', 'crystal', 'crystals', 'diamond', 'ruby', 'emerald', 'sapphire', 'amethyst', 'topaz', 'pearl', 'jewel', 'jewelry', 'crown', 'tiara', 'bracelet', 'earring', 'shard', 'shards']],
  ['Potions & magic', ['potion', 'elixir', 'flask', 'spell', 'rune', 'runes', 'orb', 'magic', 'wand', 'staff', 'tome', 'grimoire', 'totem', 'talisman', 'charm', 'cauldron', 'mana', 'enchanted']],
  ['Food & drink', ['apple', 'bread', 'meat', 'fish', 'cheese', 'cake', 'pie', 'carrot', 'potato', 'berry', 'berries', 'food', 'drink', 'cup', 'mug', 'wine', 'beer', 'coffee', 'tea', 'egg', 'eggs', 'mushroom', 'fruit', 'vegetable', 'candy', 'cookie', 'banana', 'grape', 'grapes', 'cherry', 'pear', 'melon', 'corn', 'wheat', 'tomato', 'onion', 'pumpkin', 'soup', 'steak', 'burger', 'pizza', 'donut', 'milk', 'honey', 'salad', 'sandwich', 'juice', 'lemon', 'orange', 'strawberry', 'chicken']],
  ['Tools', ['hammer', 'pickaxe', 'pick', 'shovel', 'saw', 'wrench', 'screwdriver', 'pliers', 'cutters', 'tool', 'tools', 'drill', 'crowbar', 'lockpick', 'tweezers', 'tape', 'flashlight', 'lamp', 'torch', 'lantern', 'rope', 'bucket', 'hoe', 'sickle', 'rake', 'chisel', 'anvil', 'scissors', 'brush', 'magnifier', 'magnifying', 'glass', 'binoculars', 'compass', 'ruler', 'pen', 'pencil', 'clip', 'paperclip', 'mirror', 'net', 'rod', 'fishing']],
  ['Keys & locks', ['key', 'keys', 'keyring', 'lock', 'locks', 'padlock', 'safe', 'lockbox', 'door', 'handle', 'knocker', 'vault', 'combination', 'dial', 'gate']],
  ['Money & loot', ['coin', 'coins', 'gold', 'money', 'wallet', 'cash', 'treasure', 'purse', 'loot', 'dollar', 'banknote', 'banknotes', 'bills', 'token', 'tokens', 'reward', 'trophy', 'medal', 'prize', 'ingot', 'bar', 'bars']],
  ['Containers', ['box', 'crate', 'barrel', 'case', 'briefcase', 'satchel', 'backpack', 'bag', 'bags', 'drawer', 'tray', 'chest', 'basket', 'jar', 'bottle', 'sack', 'pouch', 'container', 'cabinet', 'tube', 'envelope', 'package', 'parcel']],
  ['Documents & paper', ['book', 'books', 'notebook', 'note', 'notes', 'paper', 'letter', 'map', 'scroll', 'document', 'file', 'folder', 'report', 'card', 'cards', 'newspaper', 'clipping', 'ticket', 'photo', 'photograph', 'page', 'journal', 'diary', 'poster', 'certificate', 'contract', 'receipt', 'board', 'calendar', 'clipboard']],
  ['Science & lab', ['microscope', 'dropper', 'lab', 'sample', 'beaker', 'slide', 'fingerprint', 'forensic', 'dna', 'chemical', 'test', 'syringe', 'pill', 'pills', 'medicine', 'bandage', 'atom', 'magnet', 'petri']],
  ['Tech & electronics', ['radio', 'phone', 'camera', 'microphone', 'headphones', 'computer', 'laptop', 'chip', 'memory', 'battery', 'lens', 'screen', 'monitor', 'keyboard', 'mouse', 'cable', 'circuit', 'robot', 'drone', 'tablet', 'console', 'controller', 'speaker', 'antenna', 'satellite', 'recorder', 'tape', 'film', 'reel', 'projector', 'clock', 'watch', 'timer']],
  ['Nature & materials', ['wood', 'log', 'logs', 'stone', 'rock', 'rocks', 'ore', 'leaf', 'leaves', 'flower', 'flowers', 'plant', 'plants', 'tree', 'sand', 'mud', 'ice', 'water', 'fire', 'feather', 'bone', 'bones', 'skull', 'hair', 'seed', 'seeds', 'grass', 'shell', 'coal', 'iron', 'copper', 'silver', 'clay', 'fabric', 'leather', 'cloth', 'paint', 'chip']],
  ['Buildings & places', ['house', 'home', 'castle', 'tower', 'shop', 'store', 'mine', 'tent', 'barn', 'farm', 'church', 'bridge', 'wall', 'fence', 'well', 'mill', 'temple', 'hut', 'cabin', 'building', 'portal']],
  ['Creatures & characters', ['cat', 'dog', 'bunny', 'rabbit', 'bird', 'dragon', 'slime', 'monster', 'zombie', 'ghost', 'skeleton', 'wolf', 'bear', 'pig', 'cow', 'horse', 'sheep', 'chicken', 'frog', 'snake', 'spider', 'bat', 'man', 'woman', 'knight', 'wizard', 'miner', 'worker', 'character', 'person', 'avatar', 'head', 'face', 'outline', 'body']],
  ['UI & symbols', ['icon', 'check', 'checkmark', 'cross', 'plus', 'minus', 'star', 'heart', 'question', 'exclamation', 'info', 'button', 'arrow', 'warning', 'up', 'down', 'left', 'right', 'settings', 'gear', 'menu', 'home', 'search', 'chat', 'bubble', 'upgrade', 'level', 'xp', 'health', 'hp', 'badge', 'emblem', 'rank', 'banner', 'flag', 'marker', 'pin', 'barrier', 'trail', 'footstep', 'footsteps']],
];

const LOOKUP = new Map<string, string>();
for (const [cat, words] of KEYWORDS) for (const w of words) if (!LOOKUP.has(w)) LOOKUP.set(w, cat);

/** Words of a file name: "Evidence-Bag_02.png" → ["evidence", "bag"]. */
export function nameWords(name: string): string[] {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1);
}

const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Category from the words in a file name, or null when nothing matches. */
export function keywordCategory(name: string): string | null {
  const words = nameWords(name);
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    const hit = LOOKUP.get(w) ?? LOOKUP.get(singular(w));
    if (hit) return hit;
  }
  return null;
}

const STOP = new Set(['icon', 'icons', 'png', 'small', 'large', 'big', 'new', 'old', 'the', 'of', 'and', 'with', 'v', 'item', 'items', 'sprite', 'img', 'image', 'asset']);

/**
 * Groups from words that several names share ("evidence_bag", "evidence_box" → "Evidence").
 * Each name gets its most widely shared word (at least `min` names); the rest get null.
 */
export function sharedWordCategories(names: string[], min = 3): (string | null)[] {
  const words = names.map((n) => [...new Set(nameWords(n).filter((w) => !STOP.has(w)).map(singular))]);
  const freq = new Map<string, number>();
  for (const ws of words) for (const w of ws) freq.set(w, (freq.get(w) ?? 0) + 1);
  const title = (w: string) => w[0].toUpperCase() + w.slice(1);
  return words.map((ws) => {
    let best: string | null = null,
      n = 0;
    for (const w of ws) {
      const f = freq.get(w) ?? 0;
      // shared, but not so common it says nothing (e.g. the pack name in every file)
      if (f >= min && f < names.length * 0.8 && f > n) {
        best = w;
        n = f;
      }
    }
    return best ? title(best) : null;
  });
}

/** Colour family of a hue / saturation / lightness (h in degrees, s / l 0…1). */
export function colorFamily(h: number, s: number, l: number): string {
  if (l < 0.16) return 'Black & dark';
  if (s < 0.18) return l > 0.75 ? 'White & light' : 'Gray & silver';
  if (h < 15 || h >= 340) return 'Red';
  if (h < 40) return l < 0.4 ? 'Brown' : 'Orange';
  if (h < 65) return 'Yellow & gold';
  if (h < 160) return 'Green';
  if (h < 200) return 'Teal & cyan';
  if (h < 255) return 'Blue';
  if (h < 300) return 'Purple';
  return 'Pink';
}
