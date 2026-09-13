// Source: the three Old Stock result/standings images supplied for this game.
// Shared entries are one car; points are never added across co-drivers.
// Ratings and colours are game adaptations, not official driver assessments/liveries.
const entries=[
 ['73','Konrad Viehmann','Konrad Viehmann',192,1,3,4,1,0xb84e43],
 ['00','Koy Bechtold','Clóvis “Koy” Bechtold',166,2,5,3,2,0xe7e4d6],
 ['7','Mau / Álvaro Vilhena','Mau Vilhena / Álvaro Vilhena',164,3,10,5,0,0xd5ad38],
 ['64','Marcos Philippi','Marcos Philippi',152,4,8,9,2,0x4eab80],
 ['2','Koyzinho Bechtold','Gabriel “Koyzinho” Bechtold',151,5,2,2,3,0x507ccb],
 ['19','Leo Martins','Leonardo Martins',126,6,4,7,1,0x7b62ba],
 ['51','Pedro Pimenta','Pedro Pimenta',118,7,11,8,4,0xe78740],
 ['93','Felipe Matos / Karim','Felipe Matos / Karim Machatta',99,8,1,null,3,0x5798a2],
 ['312','Aluisio Bueno','Aluisio Bueno',88,9,9,10,2,0xa5b94d],
 ['70','Kleber Eletric','Kleber Eletric / JP Velardi',78,11,6,1,0,0xebc034],
 ['9','Marco Maragno','Marco Maragno',52,13,13,11,4,0xc5768b],
 ['74','Denis / Marcos Jr.','Denis Navarro / Marcos Jr.',45,15,7,null,1,0x688a64],
 ['88','Ailson Jr. / Lucas','Ailson Jr. / Lucas Lastellas',null,null,14,null,2,0xb5bbc4],
 ['42','Rodrigo Battistel','Rodrigo Battistel',null,null,15,null,4,0x986b4f],
];
export const RIVAL_ROSTER=Object.freeze(entries.map(([number,shortName,name,points,rank,stage3,stage4,styleIndex,color])=>{
 const results=[stage3===null?null:(15-stage3)/14,stage4===null?null:(11-stage4)/10].filter(v=>v!==null);
 const form=results.reduce((sum,v)=>sum+v,0)/results.length;
 const rating=points===null?.3+form*.15:.75*(points/192)+.25*form;
 return Object.freeze({number,shortName,name,points,rank,stage3,stage4,styleIndex,color,rating,level:Math.round(70+rating*28)});
}));
export const PLAYER_ENTRY=Object.freeze({number:'99',shortName:'Stevan Gaipo',name:'Stevan Gaipo / Edu Neves',points:67,rank:12,color:0xe2fb57});
export const GRID_SIZE=RIVAL_ROSTER.length+1;
export const GRID_ROW_SPACING=8;
export const GRID_START_BACK=Math.ceil(GRID_SIZE/2)*GRID_ROW_SPACING+12;
