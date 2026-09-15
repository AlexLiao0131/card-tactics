window.MAPS={
  prototype_field:{
    id:"prototype_field",
    name:"Prototype Field",
    width:8,
    height:6,
    terrain:[
      {x:2,y:1,terrain:"FOREST"},{x:2,y:2,terrain:"FOREST"},{x:5,y:3,terrain:"FOREST"},
      {x:3,y:0,terrain:"HIGH_GROUND",elevation:1},{x:4,y:0,terrain:"HIGH_GROUND",elevation:1},
      {x:3,y:3,terrain:"WATER"},{x:3,y:4,terrain:"WATER"},{x:4,y:4,terrain:"WATER"},
      {x:4,y:2,terrain:"WALL"},{x:5,y:2,terrain:"WALL"}
    ]
  }
};

window.MapDatabase=(()=>{
  function get(id){ return MAPS[id]||null; }
  function createMap(id){
    const src=get(id);
    if(!src) throw new Error(`Unknown map: ${id}`);
    const tiles=[];
    for(let y=0;y<src.height;y++){
      for(let x=0;x<src.width;x++) tiles.push({x,y,terrain:"PLAIN",elevation:0});
    }
    src.terrain.forEach(data=>{
      const tile=tiles.find(t=>t.x===data.x&&t.y===data.y);
      if(tile) Object.assign(tile,data);
    });
    return {id:src.id,name:src.name,width:src.width,height:src.height,tiles};
  }
  return {get,createMap};
})();
