export const CIRCUITS=Object.freeze({
 interlagos:{id:'interlagos',name:'Interlagos',label:'AUTÓDROMO JOSÉ CARLOS PACE',length:4309,description:'4.309 m · 15 curvas · São Paulo, SP',intro:'Subidas, descidas e caimentos do relevo municipal. Pit lane completo: entrada depois do Café, retorno na Reta Oposta.',source:'Mapa e pit lane FIA 2025 · GeoSampa LiDAR 2017 e ortofoto 2020 (20 cm).',fuel:'Uma volta em Interlagos costuma gastar 3–4 L.',altitude:720},
 curvelo:{id:'curvelo',name:'Oval de Curvelo',label:'CIRCUITO DOS CRISTAIS · CURVELO, MG',length:1250,description:'1.250 m · 2 curvas · Inclinação de até 16%',intro:'Duas retas, uma curva inclinada e outra plana. O primeiro oval brasileiro entra no grid.',source:'Traçado CBA · extensão NASCAR Brasil · inclinação Circuito dos Cristais. Larguras e terreno aproximados.',fuel:'O oval é curto: reserve 1–2 L por volta.',altitude:null},
 // Old Stock Race venues rebuilt from open data (scripts/circuitos/, fontes-circuitos.md):
 // data is the track file, ground the Sentinel-2 colour of its terrain grid.
 cascavel:{id:'cascavel',name:'Cascavel',label:'AUTÓDROMO ZILMAR BEUX · CASCAVEL, PR',length:3058,description:'3.058 m · 7 curvas · anti-horário · Cascavel, PR',intro:'Reta dos boxes de concreto, em descida, até o Bacião: a curva de quase 200 km/h. 46 m de desnível do relevo real.',source:'Traçado OSM refinado sobre imagem aérea de 2025 · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:'Uma volta em Cascavel costuma gastar 2–3 L.',altitude:680,
  data:'../dados/pista_cascavel.json',ground:'./assets/circuitos/cascavel_solo.jpg',track:'CASCAVEL',boxTitle:'Cuida do Opala, piá!',weather:'Cascavel · 16h40 · 24 °C · pista seca',venue:'Autódromo Internacional Zilmar Beux'},
 piracicaba:{id:'piracicaba',name:'ECPA Piracicaba',label:'AUTÓDROMO DO ECPA · PIRACICABA, SP',length:1930,description:'1.930 m medidos (2,1 km divulgados) · 9 curvas · horário',intro:'Anel externo rápido e um miolo travado de grampos, com subidas e descidas. Arquibancada na reta, paddock no alto.',source:'Traçado OSM refinado sobre imagem aérea de 2025 · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:'O traçado é curto: reserve 1,5–2 L por volta.',altitude:490,
  data:'../dados/pista_piracicaba.json',ground:'./assets/circuitos/piracicaba_solo.jpg',track:'ECPA PIRACICABA',boxTitle:'Cuida do Opala, caipira!',weather:'Piracicaba · 16h40 · 27 °C · pista seca',venue:'Esporte Clube Piracicabano de Automobilismo'}
});
export const circuitId=value=>typeof value==='string'&&Object.hasOwn(CIRCUITS,value)?value:'interlagos';
export function selectedCircuit(saved,search=''){
 const value=new URLSearchParams(search).get('circuito');
 return CIRCUITS[value!==null?circuitId(value):circuitId(saved)];
}
export function mapProjection(samples,width=260,height=300){
 const xs=samples.map(p=>p[1]),ys=samples.map(p=>p[2]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min((width-32)/Math.max(1,maxX-minX),(height-36)/Math.max(1,maxY-minY));
 return (x,y)=>[width/2+(x-(minX+maxX)/2)*scale,height/2-(y-(minY+maxY)/2)*scale];
}
