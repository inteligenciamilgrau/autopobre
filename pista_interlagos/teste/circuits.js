export const CIRCUITS=Object.freeze({
 interlagos:{id:'interlagos',name:'Interlagos',label:'AUTÓDROMO JOSÉ CARLOS PACE',length:4309,description:'4.309 m · 15 curvas · São Paulo, SP',intro:'Subidas, descidas e caimentos reconstruídos a partir do relevo municipal.',source:'Mapa FIA 2025 · GeoSampa LiDAR 2017 e ortofoto 2020.',fuel:'Uma volta em Interlagos costuma gastar 3–4 L.',altitude:720},
 curvelo:{id:'curvelo',name:'Oval de Curvelo',label:'CIRCUITO DOS CRISTAIS · CURVELO, MG',length:1250,description:'1.250 m · 2 curvas · Inclinação de até 16%',intro:'Duas retas, uma curva inclinada e outra plana. O primeiro oval brasileiro entra no grid.',source:'Traçado CBA · extensão NASCAR Brasil · inclinação Circuito dos Cristais. Larguras e terreno aproximados.',fuel:'O oval é curto: reserve 1–2 L por volta.',altitude:null}
});
export const circuitId=value=>Object.hasOwn(CIRCUITS,value)?value:'interlagos';
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
