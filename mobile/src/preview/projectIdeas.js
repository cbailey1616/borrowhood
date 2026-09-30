// Curated suggestions: no external AI service or automated requests.
const item = (label, icon, ...terms) => ({ label, icon, terms });
export const PROJECTS = [
  { id: 'camp', name: 'Camping trip', description: 'A night under the stars', icon: 'project-camp', items: [
    item('Tent','project-camp','tent'), item('Sleeping bags','document-text','sleeping bag'),
    item('Camp stove','bonfire','camp stove','camping stove'), item('Cooler','cooler','cooler','ice chest'),
    item('Lantern','bulb','lantern'), item('Folding chairs','folding-chair','folding chair','camp chair','camping chair'),
  ] },
  { id: 'move', name: 'Moving house', description: 'Make the heavy lifting lighter', icon: 'cube', items: [
    item('Dolly','construct','dolly','hand truck'), item('Moving blankets','document-text','moving blanket'),
    item('Tie-down straps','construct','tie down','ratchet strap','moving strap'), item('Boxes','cube','moving box','cardboard box','packing box'),
    { ...item('Truck or trailer','car','moving truck','pickup truck','utility trailer','cargo trailer','moving trailer'), optional: true },
  ] },
  { id: 'party', name: 'Party or BBQ', description: 'Good food, good company', icon: 'project-party', items: [
    item('Folding tables','folding-table','folding table','party table'), item('Folding chairs','folding-chair','folding chair','party chair'),
    item('Grill','bonfire','grill','barbecue','bbq'), item('Extra coolers','cooler','cooler','ice chest'),
    item('Speakers','musical-notes','speaker'), item('String lights','bulb','string light','fairy light','festoon light'),
  ] },
  { id: 'paint', name: 'Painting a room', description: 'A fresh coat, a fresh start', icon: 'project-paint', items: [
    item('Ladder','construct','ladder'), item('Paint rollers','project-paint','paint roller'), item('Paint trays','project-paint','paint tray'),
    item('Drop cloths','document-text','drop cloth'), item('Extension pole','construct','paint pole','extension pole'),
  ] },
  { id: 'beach', name: 'Beach day', description: 'A little sand, a little sunshine', icon: 'project-beach', items: [
    item('Beach umbrella','project-beach','beach umbrella','sun umbrella'), item('Beach chairs','folding-chair','beach chair'),
    item('Cooler','cooler','cooler','ice chest'), item('Beach wagon','project-garden','beach wagon','folding wagon'),
    item('Beach games','football','spikeball','volleyball set','volleyball net','beach game'),
  ] },
  { id: 'diy', name: 'Home DIY project', description: 'Bring your next idea to life', icon: 'project-diy', items: [
    item('Drill','hammer','drill'), item('Saw','construct','circular saw','jigsaw','miter saw','mitre saw','hand saw','table saw'),
    item('Level','construct','spirit level','laser level','bubble level'), item('Stud finder','construct','stud finder'),
    item('Sander','construct','sander'),
  ] },
  { id: 'paddle', name: 'Kayaking day', description: 'A little adventure on the water', icon: 'project-paddle', items: [
    item('Kayak','project-paddle','kayak'), item('Paddles','project-paddle','kayak paddle','paddle'),
    item('Life jackets','project-paddle','life jacket','life vest','personal flotation device','pfd'),
    item('Dry bags','document-text','dry bag'),
    { ...item('Roof rack or carrier','car','kayak rack','kayak carrier','roof rack'), optional: true },
  ] },
  { id: 'snow', name: 'Ski or snowboard trip', description: 'Gear up for a snowy escape', icon: 'project-snow', items: [
    item('Skis or snowboard','project-snow','skis','ski set','snowboard'), item('Boots','project-snow','ski boot','snowboard boot'),
    item('Helmet','project-snow','ski helmet','snowboard helmet','snow helmet'), item('Goggles','project-snow','ski goggle','snowboard goggle','snow goggle'),
    item('Snow gear','document-text','snow pant','ski pant','ski jacket','snow jacket','snowsuit','snow suit'),
  ] },
  { id: 'guests', name: 'Overnight guests', description: 'Make a little room for loved ones', icon: 'project-guests', items: [
    item('Air mattress','project-guests','air mattress','air bed','inflatable mattress'),
    item('Extra bedding','document-text','bedding','bed sheet','duvet','comforter'), item('Towels','document-text','towel'),
    { ...item('Pack-n-play','project-guests','pack n play','pack and play','travel crib','travel cot','playard'), optional: true },
  ] },
  { id: 'yard', name: 'Garden or yard overhaul', description: 'A fresh start for your outdoor space', icon: 'project-garden', items: [
    item('Tiller','construct','tiller','cultivator'), item('Hedge trimmer','construct','hedge trimmer'),
    item('Wheelbarrow','project-garden','wheelbarrow'), item('Pressure washer','construct','pressure washer','power washer'),
    item('Leaf blower','leaf','leaf blower'),
  ] },
  { id: 'movie', name: 'Outdoor movie night', description: 'Bring the big screen home', icon: 'project-movie', items: [
    item('Projector','camera','projector'), item('Movie screen','project-movie','projector screen','projection screen','movie screen'),
    item('Speakers','musical-notes','speaker'), item('Extension cords','construct','extension cord','extension cable'),
    item('Blankets or bean bags','document-text','blanket','bean bag','beanbag'),
  ] },
];
export const normalizeProjectText = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const matchesProjectItem = (title, terms) => {
  const normalized = ` ${normalizeProjectText(title)} `;
  return terms.some(term => {
    const word = normalizeProjectText(term);
    if (!word) return false;
    // An accessory is not the essential itself (e.g. a screen is not a projector).
    const accessory = { tent: /\btent (stakes?|pegs?|poles?|repair|footprint)\b/, projector: /\bprojector (screen|mount|bulb|case)\b/, chair: /\bchair (cover|cushion)s?\b/, drill: /\bdrill (bits?|case)\b/, skis: /\bski (boots?|poles?|helmets?|goggles?)\b/, snowboard: /\bsnowboard (boots?|bindings?|helmets?|bag|case)\b/ }[word];
    if (accessory?.test(normalized)) return false;
    return normalized.includes(` ${word} `) || normalized.includes(` ${word}s `);
  });
};

const STATE_CODES = Object.fromEntries([
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
].flatMap(([code,name])=>[[code.toLowerCase(),code],[name.toLowerCase(),code]]));
const COLD_REGIONS = new Set('AK CO CT ID IL IN IA ME MA MI MN MT NE NH NJ NY ND OH PA RI SD UT VT WI WY'.split(' '));
const MOUNTAIN_TOWNS = {
  CA:['mammoth lakes','truckee','south lake tahoe','tahoe city','big bear lake'],
  NV:['incline village','stateline'], NC:['boone','blowing rock','banner elk','beech mountain'],
  TN:['gatlinburg'], NM:['taos','ruidoso'], AZ:['flagstaff'],
};

// Region + time of year are a lightweight heuristic, not a weather forecast.
// Unknown locations use general plans rather than assuming a snowy climate.
export function seasonalProjects(date = new Date(), location = {}) {
  const month = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',month:'numeric'}).format(date));
  const state = STATE_CODES[String(location.state || '').trim().toLowerCase()];
  const city = String(location.city || '').trim().toLowerCase();
  const snowyRegion = COLD_REGIONS.has(state) || !!MOUNTAIN_TOWNS[state]?.includes(city);
  const winter = month <= 3 || month >= 11;
  const snowSeason = snowyRegion && winter;
  const warmWinter = ['FL','HI'].includes(state) || state === 'AZ' && !snowyRegion;
  const warmMonths = snowyRegion ? month >= 5 && month <= 9 : month >= 4 && month <= 10;
  const shoulderSeason = [4,5,9,10].includes(month);
  const scores = snowSeason
    ? {snow:4,guests:3,diy:3,paint:3,move:2,party:1,movie:0,yard:1,camp:0,beach:0}
    : warmMonths || warmWinter
      ? {paddle:3,beach:3,camp:3,party:3,movie:3,yard:shoulderSeason?4:2,move:2,diy:1,paint:1,guests:1}
      : {paddle:0,beach:0,camp:1,party:2,movie:1,yard:shoulderSeason?3:1,move:2,diy:3,paint:3,guests:3};
  return PROJECTS.filter(project => project.id !== (snowSeason ? 'paddle' : 'snow'))
    .map(project => ({...project,seasonPriority:scores[project.id] ?? 1}));
}
