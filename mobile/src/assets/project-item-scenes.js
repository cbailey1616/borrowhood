// Original object drawings for checklist essentials. These stay recognizable
// at thumbnail size instead of reusing a category or navigation symbol.
const sage='#ADC3AC', moss='#7F9F88', cream='#EFE2C5', gold='#DABB7F', peach='#DDB69C', wood='#BA9C77';
const p=(d,fill='none',extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
const r=(x,y,w,h,fill,rx=4)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const e=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const cooler=()=>r(19,32,58,41,sage,7)+r(16,27,64,13,cream)+p('M25 42V57M71 42V57M38 47H58M33 29V20H63V29')+r(44,36,8,12,gold,2);
const chair=()=>p('M27 18H68L63 49H33Z',sage)+p('M25 49H66L73 57H30Z',cream)+p('M32 57L24 79M63 57L72 79M30 74L67 57M65 75L32 57M24 41V56M72 41V56', 'none', 'stroke-width="2.5"')+p('M33 24H61M32 29H60','none','stroke="#91AB91"');
const blankets=()=>r(20,52,58,19,sage)+r(17,39,59,16,cream)+r(24,26,52,16,peach)+p('M61 28V40M22 45H67M27 58H69M29 63H67')+p('M23 72V76M31 72V76M39 72V76M47 72V76M55 72V76M63 72V76M71 72V76','none','stroke="#8CA489"');
const ladder=()=>p('M23 78L37 16H57L72 78M28 62H66M31 48H62M34 34H60M37 20H57','none','stroke-width="4"')+p('M40 18L57 78','none','stroke="#B79B6F" stroke-width="3"');
const paddle=()=>p('M27 28L68 65','none','stroke-width="4"')+p('M15 13Q24 9 35 20L41 33L27 32Q12 27 15 13Z',sage)+p('M60 61L73 62Q85 70 81 81Q70 86 60 72Z',gold)+p('M19 17L33 28M66 68L77 77','none','stroke="#98AD8B"');
const speaker=()=>r(22,12,51,66,moss,8)+r(27,17,41,56,sage,5)+e(48,31,7,7,cream)+e(48,56,14,14,gold)+e(48,56,7,7,wood)+p('M36 78V81M60 78V81');
const jacket=()=>p('M34 19L45 27H52L62 19L79 32L70 56L60 51V77H35V51L25 56L17 32Z',sage)+p('M34 19L42 34L48 29L54 34L62 19M48 31V76M35 59H43M53 59H60')+r(44,43,8,5,gold,1);
const drawings={
  'tent':()=>p('M12 72L46 20L84 73Z',sage)+p('M46 20L58 73H84Z',moss)+p('M24 72L46 35L58 73Z',cream)+p('M46 35V72M11 76H85M16 71L9 81M79 72L86 81'),
  'sleeping bags':()=>p('M29 25Q29 13 44 13Q59 13 59 25V73Q59 79 44 79Q29 79 29 73Z',sage)+e(44,25,11,8,cream)+p('M35 43H54M35 55H54M35 67H54M54 31V74')+r(62,43,17,35,gold,8)+p('M65 50H75M65 69H75'),
  'camp stove':()=>r(20,24,56,25,sage)+r(16,50,64,24,moss)+p('M24 33H43M53 33H70M29 28V40M63 28V40M26 58H43M54 58H69')+e(34,61,3,3,gold)+e(62,61,3,3,gold)+p('M22 75V80M75 75V80'),
  'cooler':cooler,'extra coolers':cooler,
  'lantern':()=>p('M34 29V20Q48 1 62 20V29')+r(31,27,34,8,moss)+r(34,35,28,34,cream,2)+p('M36 37V67M59 37V67')+p('M48 45Q38 55 48 61Q58 56 48 45Z',gold)+p('M31 69H65L70 77H26Z',moss),
  'folding chairs':chair,'beach chairs':chair,
  'dolly':()=>p('M38 15H57Q65 15 65 24V73H24','none','stroke-width="4"')+r(24,32,35,28,gold)+p('M40 34V59M27 42H56')+e(62,75,8,8,moss)+e(62,75,3,3,cream),
  'moving blankets':blankets,'extra bedding':blankets,'towels':blankets,
  'tie down straps':()=>p('M22 31Q12 61 38 68Q73 80 76 46Q77 25 60 23','none','stroke="#BCA16B" stroke-width="8"')+r(34,21,31,22,moss)+r(40,25,19,10,cream,2)+p('M38 43V55H53L57 43M21 30L22 19H31M66 23L72 14H80'),
  'boxes':()=>p('M16 39L46 26L79 42L47 56Z',cream)+p('M16 39V69L47 82V56Z',gold)+p('M47 56L79 42V71L47 82Z',wood)+p('M29 33L61 49V62M24 61L36 66M43 22L54 12L74 26L65 35Z',cream),
  'truck or trailer':()=>r(9,27,45,37,sage)+p('M54 37H68L83 53V64H54Z',gold)+p('M59 41H67L76 52H59Z',cream)+e(28,67,9,9,moss)+e(70,67,9,9,moss)+e(28,67,4,4,cream)+e(70,67,4,4,cream)+p('M16 34H44M16 39H44'),
  'folding tables':()=>p('M13 30L68 22L84 36L27 45Z',cream)+p('M27 45L84 36V42L27 51Z',wood)+p('M28 52L65 78M76 45L38 79M26 50L23 78M75 45L80 76','none','stroke-width="3"')+p('M24 34L67 28'),
  'grill':()=>e(48,39,29,10,moss)+p('M19 40Q21 63 49 64Q76 61 77 40Z',sage)+p('M31 63L24 80M64 61L70 80M32 74H64M35 33H62M39 28V43M48 27V45M57 28V43')+e(70,79,5,5,wood)+p('M79 36H87M27 23Q21 17 27 10M47 22Q41 15 47 8'),
  'speakers':speaker,
  'string lights':()=>p('M10 22Q49 51 86 20M11 55Q49 79 86 53')+[22,40,59,77].map((x,i)=>p(`M${x} ${[30,39,39,28][i]}V${[35,44,44,33][i]}`)+e(x,[40,49,49,38][i],4,6,gold)).join('')+[23,43,63,79].map((x,i)=>e(x,[68,77,76,66][i],3.5,5,cream)).join(''),
  'ladder':ladder,
  'paint rollers':()=>r(18,20,50,15,sage,6)+p('M68 27H78V45H49V58','none','stroke-width="3"')+r(43,57,12,25,wood)+p('M23 24H58','none','stroke="#CCD9B8"'),
  'paint trays':()=>p('M24 21H77L68 77H11Z',wood)+p('M29 26H70L64 60H22Z',sage)+p('M23 64H63L61 72H19Z',cream)+p('M33 33H64M31 40H63M29 47H61M27 54H60','none','stroke="#C3D0B4"'),
  'drop cloths':()=>p('M18 36L57 25L80 42L70 77L39 73L13 80Z',cream)+p('M18 36L40 50L39 73M40 50L80 42M26 47L17 71M59 48L56 69','none','stroke="#B8AB90"')+e(31,58,2,2,sage)+e(65,64,3,2,peach),
  'extension pole':()=>p('M25 75L69 24','none','stroke="#B49A72" stroke-width="7"')+p('M29 70L55 40','none','stroke="#D8C7A7" stroke-width="3"')+p('M67 25L76 15','none','stroke-width="4"')+p('M22 75L28 79M48 43L55 49','none','stroke-width="3"'),
  'beach umbrella':()=>p('M12 42Q48 -5 85 42Q67 32 49 42Q30 32 12 42Z',gold)+p('M49 14Q28 23 29 38M49 14Q69 23 68 38M49 42V77M49 77Q48 85 41 80'),
  'beach wagon':()=>p('M19 34H72L67 63H26Z',sage)+p('M24 40H67M31 35L35 63M58 35L55 63M28 65H65')+e(28,72,7,7,wood)+e(63,72,7,7,wood)+p('M71 35L80 20H88','none','stroke-width="3"'),
  'beach games':()=>e(45,55,26,12,wood)+e(45,51,26,10,cream)+p('M22 56L16 73M66 56L74 73M31 45L60 58M26 48L55 60M24 52L45 62M32 60L51 43M43 61L62 45','none','stroke="#9BAD8C"')+e(74,28,10,10,gold)+p('M66 24Q77 25 78 36M68 34Q70 22 81 22'),
  'drill':()=>p('M21 23H60V46H35L31 66H50L54 46H60Z',sage)+r(26,65,30,10,moss)+p('M60 29H75V39H60Z',wood)+p('M75 34H86','none','stroke-width="3"')+p('M28 30H50M34 53H43')+r(45,44,7,8,gold,1),
  'saw':()=>p('M14 47L57 31L66 53L17 70L21 63L18 60L26 57L22 54Z',cream)+p('M57 31Q64 17 77 24L83 40Q83 48 67 54Z',wood)+p('M65 33Q72 28 75 34L77 41L69 44Z',sage),
  'level':()=>r(12,37,72,22,gold)+r(36,41,25,14,cream,3)+e(47,48,4,4,sage)+p('M44 43V53M52 43V53M20 42V54M76 42V54'),
  'stud finder':()=>p('M32 14H61L68 29V72Q48 87 29 72V29Z',moss)+r(36,29,24,20,cream)+p('M41 34H55M41 39H51')+e(48,62,7,7,gold)+p('M20 28Q12 37 20 46M75 28Q83 37 75 46'),
  'sander':()=>p('M25 41Q27 21 48 21Q68 21 70 41L75 61H20Z',sage)+p('M35 39V33Q47 23 60 33V39Z',wood)+r(17,61,61,10,gold)+p('M23 71H72M70 48Q86 50 81 64M30 49H61'),
  'kayak':()=>p('M12 55Q48 5 86 55Q48 95 12 55Z',gold)+p('M12 55H86')+e(49,51,17,12,moss)+e(49,51,11,7,cream)+p('M27 44L31 39M66 42L69 47M32 68H63'),
  'paddles':paddle,
  'life jackets':()=>p('M29 16L42 22V38L48 44L54 38V22L67 16L78 34L67 43V76H29V43L18 34Z',gold)+p('M29 17Q25 40 32 61M67 17Q71 40 64 61M48 44V77M31 53H65M31 65H65')+r(42,50,12,6,moss,1)+r(42,62,12,6,moss,1)+p('M35 27V43M61 27V43','none','stroke="#EDDBA9" stroke-width="4"'),
  'dry bags':()=>p('M30 24H64L69 73Q48 83 26 73Z',sage)+r(28,17,39,12,moss)+p('M31 18L34 10H60L63 18M33 34V67M62 35V67')+r(39,45,18,17,cream)+p('M45 51Q40 59 48 60Q57 59 50 51Z',moss),
  'roof rack or carrier':()=>p('M17 65H80L75 48H24Z',sage)+p('M24 48H75M31 47V37H39V47M59 47V37H67V47')+p('M15 31Q48 10 82 30Q48 42 15 31Z',gold)+p('M20 65V73M77 65V73M28 55H68'),
  'skis or snowboard':()=>p('M31 12Q38 7 42 20L58 76L48 79Z',gold)+p('M64 12Q71 10 67 22L48 78L38 75Z',sage)+r(40,46,11,12,moss,2)+p('M50 46L59 50L56 61L46 57Z',wood),
  'boots':()=>p('M31 18H61L56 56L75 63Q84 78 69 80H22V63L29 54Z',sage)+p('M23 72H77V80H22Z',wood)+p('M30 30H60M30 43H59M33 31V39M33 44V52')+r(41,29,12,7,gold,1)+r(40,42,12,7,gold,1),
  'helmet':()=>p('M16 55Q10 17 45 16Q77 13 82 46L68 62H55V46H39L33 64H20Z',sage)+p('M25 37Q28 23 43 22M52 22L64 26M61 61L56 77L43 77L35 62')+r(44,73,14,6,gold,2),
  'goggles':()=>p('M13 33H84L78 62H58L48 53L37 62H17Z',gold)+p('M23 38H72L69 54H58L48 45L37 54H25Z',sage)+p('M29 41L24 49M35 41L29 50','none','stroke="#EAF0DC" stroke-width="3"')+p('M14 43L8 43V54H16M82 43H89V53H80'),
  'snow gear':jacket,
  'air mattress':()=>p('M14 42L64 29L85 51L32 67Z',sage)+p('M14 42V56L32 76V67M32 67L85 51V66L32 76Z',moss)+p('M28 44L59 36M33 50L65 42M39 56L71 48','none','stroke="#D9E3C8" stroke-width="4"')+p('M20 33L39 27L47 35L28 41Z',cream),
  'pack n play':()=>p('M16 31L63 21L83 36L35 48Z',cream)+p('M16 31V64L35 78V48Z',sage)+p('M35 48L83 36V65L35 78Z',moss)+p('M21 39L30 46V66L21 59Z',cream)+p('M42 53L75 44V59L42 69Z',cream)+p('M19 65V76M38 76V82M81 65V77M56 37V25','none','stroke-width="3"'),
  'tiller':()=>p('M22 52H58L66 67H19Z',sage)+r(28,37,22,15,moss)+p('M58 52L69 19H82','none','stroke-width="3"')+e(34,70,10,10,wood)+p('M55 72H73M58 65L64 79M68 65L60 79'),
  'hedge trimmer':()=>p('M16 50H50L56 39L48 28H21Z',sage)+p('M22 35H34V44H22Z',cream)+p('M49 37H84V45H51Z',wood)+p('M58 37V31M67 37V31M76 37V31M58 45V51M67 45V51M76 45V51','none','stroke-width="3"')+p('M23 49V64H39V51','none','stroke-width="3"'),
  'wheelbarrow':()=>p('M12 31H73L60 55H30Z',sage)+p('M26 36H62')+p('M59 54L77 78M33 55L21 76M71 32L81 18H89','none','stroke-width="3"')+e(45,71,10,10,wood)+e(45,71,4,4,cream),
  'pressure washer':()=>p('M27 28V14H56V30','none','stroke-width="3"')+r(23,29,40,41,sage)+r(33,38,20,15,cream)+e(30,73,7,7,wood)+e(59,73,7,7,wood)+p('M64 44Q84 34 84 58Q84 77 71 68L77 23','none','stroke-width="3"')+p('M77 23L89 14M72 41H80'),
  'leaf blower':()=>p('M16 36Q16 24 35 24H54L63 37L56 54H31Q16 52 16 36Z',sage)+p('M33 25V15H51L55 26','none','stroke-width="3"')+p('M60 36L85 48L79 59L55 48Z',gold)+e(33,38,9,9,moss)+p('M27 38H39M33 32V44'),
  'projector':()=>r(16,33,65,34,sage,7)+e(66,48,12,12,wood)+e(66,48,7,7,cream)+p('M24 41H44M24 47H44M24 53H42M25 68V74M71 68V74')+r(29,28,22,5,moss,2),
  'movie screen':()=>r(16,16,65,45,cream,1)+r(21,21,55,35,sage,1)+p('M16 16H82M48 62V76M48 76L26 83M48 76L70 83','none','stroke-width="3"')+p('M43 30L58 39L43 48Z',moss),
  'extension cords':()=>e(43,48,26,25,gold)+e(43,48,19,18,cream)+e(43,48,12,11,gold)+p('M65 63Q84 73 82 41')+r(74,25,13,16,moss,3)+p('M77 25V18M84 25V18M19 32L11 23M9 17L16 24L8 31L1 24Z',sage),
  'blankets or bean bags':()=>p('M18 63Q14 48 35 34Q45 20 66 30Q83 37 81 60Q83 79 48 81Q19 81 18 63Z',peach)+p('M36 36Q43 63 25 69M49 32Q58 51 76 55','none','stroke="#B8957F"')+r(27,61,36,15,sage)+p('M31 66H59M34 70H55'),
};
const normalize=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={'folding table':'folding tables','folding chair':'folding chairs','life jacket':'life jackets','dry bag':'dry bags','paddle':'paddles','tie down straps':'tie down straps'};
export function projectItemSvg(label) {
  const key=normalize(label),draw=drawings[aliases[key]||key];
  if(!draw)return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="82" rx="36" ry="5" fill="#DDD6BF"/><g stroke="#536451" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${draw()}</g></svg>`;
}
