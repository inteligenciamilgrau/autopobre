// Source: the three Old Stock result/standings images supplied for this game.
// Shared entries are one car; points are never added across co-drivers.
// Ratings are game adaptations, not official driver assessments. Colours: body and side
// stripe from the list the 99 team sent (2026-09-27); a null stripe keeps the plain light one
// (only the body colour is known), #88's colours are not known yet.
const LIGHT_STRIPE=0xe4e4d5;
// Race option "Koyzinho Indestrutível" (off by default): this car drives as the ace (ACE_STYLE in
// race-field.js) and starts just ahead of the player, in the last rival slot.
export const ACE_NUMBER='2';
// Rival level (race setting "Nível dos adversários"): 'facil' is the original field, rated from the
// standings; the others rate each driver by the table the pilots sent (2026-09-27), up to Impossível,
// whose best drivers race at Koyzinho Indestrutível's pace (race-field.js PRO_LEVELS).
export const AI_LEVELS=Object.freeze(['facil','medio','alto','impossivel']);
export const AI_LEVEL_NAMES=Object.freeze({facil:'Fácil',medio:'Médio',alto:'Alto',impossivel:'Impossível'});
// The pilots' table: skill 1-10 and chance of a mistake 1-10 ("Aloísio is so slow he can't go wrong").
// It has no line for the 99 (the player's own car): when Stevan Gaipo races it as a rival (Modo
// Corrida's car screen), mid-field, a game adaptation like the others.
const PILOT_TABLE={'2':[10,1],'73':[9,2],'7':[8,2],'64':[8,3],'00':[8,3],'19':[7,3],'51':[9,1],'93':[9,2],'312':[5,1],'70':[10,1],'9':[7,3],'74':[7,3],'88':[7,3],'42':[6,3],'99':[7,3]};
const entries=[
 ['73','Konrad Viehmann','Konrad Viehmann',192,1,3,4,1,0xe8731c,null],
 ['00','Koy Bechtold','Clóvis “Koy” Bechtold',166,2,5,3,2,0xeeeeea,0x1f4fb5],
 ['7','Mau / Álvaro Vilhena','Mau Vilhena / Álvaro Vilhena',164,3,10,5,0,0xc81d25,null],
 ['64','Marcos Philippi','Marcos Philippi',152,4,8,9,2,0xb3151c,null],
 ['2','Koyzinho Bechtold','Gabriel “Koyzinho” Bechtold',151,5,2,2,3,0xe9ebe6,0x2a5cc4],
 ['19','Leo Martins','Leonardo Martins',126,6,4,7,1,0xc9a03a,0x141516,{metalness:.55,roughness:.3}],
 ['51','Pedro Pimenta','Pedro Pimenta',118,7,11,8,4,0x1d4fb8,0xc81d25],
 ['93','Felipe Matos / Karim','Felipe Matos / Karim Machatta',99,8,1,null,3,0x8a8f95,null],
 ['312','Aloísio Bueno','Aloísio Bueno',88,9,9,10,2,0x6cb6e8,0x141516],
 ['70','Kleber Eletric','Kleber Eletric / JP Velardi',78,11,6,1,0,0xf07c18,0x1f4fb5],
 ['9','Marco Maragno','Marco Maragno',52,13,13,11,4,0x2156c4,0x2f9b4b],
 ['74','Denis / Marcos Jr.','Denis Navarro / Marcos Jr.',45,15,7,null,1,0xd9362c,null],
 ['88','Ailson Jr. / Lucas','Ailson Jr. / Lucas Lastellas',null,null,14,null,2,0xb5bbc4,null],
 ['42','Rodrigo Battistel','Rodrigo Battistel',null,null,15,null,4,0x161718,0xf2c418],
];
// A 0xRRGGBB colour's relative luminance (0 black, 1 white) and its CSS form.
export const luminance=hex=>(.2126*(hex>>16&255)+.7152*(hex>>8&255)+.0722*(hex&255))/255;
export const cssColor=hex=>`#${hex.toString(16).padStart(6,'0')}`;
// color: the body; stripe: the side stripe; finish: paint other than the plain gloss (gold);
// mark: the colour that reads on the dark track map (the stripe of a black car). A driver with no
// stage result counts as mid-form.
const rosterEntry=([number,shortName,name,points,rank,stage3,stage4,styleIndex,color,stripe,finish=null])=>{
 const results=[stage3===null?null:(15-stage3)/14,stage4===null?null:(11-stage4)/10].filter(v=>v!==null);
 const form=results.length?results.reduce((sum,v)=>sum+v,0)/results.length:.5;
 const rating=points===null?.3+form*.15:.75*(points/192)+.25*form;
 stripe??=LIGHT_STRIPE;const mark=luminance(color)<.15?stripe:color;const [skill,errors]=PILOT_TABLE[number];
 return Object.freeze({number,shortName,name,points,rank,stage3,stage4,styleIndex,color,stripe,finish:finish&&Object.freeze(finish),mark,rating,level:Math.round(70+rating*28),skill,errors});
};
export const RIVAL_ROSTER=Object.freeze(entries.map(rosterEntry));
export const PLAYER_ENTRY=Object.freeze({number:'99',shortName:'Stevan Gaipo',name:'Stevan Gaipo / Edu Neves',points:67,rank:12,color:0xe2fb57});
// Modo Corrida's car selection (car-select.js): the player may race any car of the grid. Every car is
// the same Opala (same physics); what changes is the team's paint and number. The driver of the car
// taken sits the race out and Stevan Gaipo races the Opala 99 in its seat, with the 99's own livery
// (black, the yellow stripe). His pace: the pilots' table's '99' line and the standings rating from
// his 67 points.
export const OPALA_99_RIVAL=rosterEntry(['99',PLAYER_ENTRY.shortName,PLAYER_ENTRY.name,PLAYER_ENTRY.points,PLAYER_ENTRY.rank,null,null,3,0x17191b,0xf0cd1f]);
export const GRID_SIZE=RIVAL_ROSTER.length+1;
export const GRID_ROW_SPACING=8;
export const GRID_START_BACK=Math.ceil(GRID_SIZE/2)*GRID_ROW_SPACING+12;
// A grid slot: how far behind the start line (pole 12 m, two by two, the right-hand car 2 m back) and
// its side of the road. Behind the whole field the Opala 99 starts mid-road (GRID_START_BACK); with
// fewer rivals (a solo practice, a 1x1) it takes the next slot, at the front.
export const gridSlot=slot=>({back:12+Math.floor(slot/2)*GRID_ROW_SPACING+(slot%2)*2,lane:slot%2?2.2:-2.2});
export const playerGridSlot=(rivals=RIVAL_ROSTER.length)=>rivals<RIVAL_ROSTER.length?gridSlot(rivals):{back:GRID_START_BACK,lane:0};
// Solo practice (no rivals, no flag) and the 1x1 against one chosen driver: Modo Corrida's single races.
export const DUEL_DEFAULT='73';
export const rivalEntry=number=>RIVAL_ROSTER.find(e=>e.number===number)??null;
// The cars on the selection screen, the Opala 99 first; the player's car by number.
export const PLAYER_CAR_DEFAULT='99';
export const CAR_CHOICES=Object.freeze([OPALA_99_RIVAL,...RIVAL_ROSTER]);
export const carEntry=number=>CAR_CHOICES.find(e=>e.number===number)??null;
// The model the player races in Modo Corrida (the car screen's tabs): the Opala, or a Fusca (fusca.js) in
// the colours of one of the same 15 cars. The Fusca 99 is Stevan Gaipo's black one with the yellow stripe,
// without the Opala 99's sponsors.
export const CAR_MODELS=Object.freeze(['opala','fusca']);
export const CAR_MODEL_DEFAULT='opala';
export const MODEL_NAMES=Object.freeze({opala:'Opala',fusca:'Fusca'});
// The rivals when the player races `car`: the roster, that car's seat taken by the Opala 99 (same
// index, so the grid's cars and their models keep their places).
export const fieldRoster=(car=PLAYER_CAR_DEFAULT)=>car===PLAYER_CAR_DEFAULT||!rivalEntry(car)?RIVAL_ROSTER:Object.freeze(RIVAL_ROSTER.map(e=>e.number===car?OPALA_99_RIVAL:e));
// The 1x1's rival when the player races `car`: the one asked for; asking for that car's own driver
// gives the 99, now in its seat.
export function duelRivalFor(car,wanted){const number=wanted===car?OPALA_99_RIVAL.number:wanted;return fieldRoster(car).some(e=>e.number===number)?number:DUEL_DEFAULT;}
