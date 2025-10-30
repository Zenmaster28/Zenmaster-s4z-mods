import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
import * as ec from '/pages/deps/src/echarts.mjs';
import * as theme from '/pages/src/echarts-sauce-theme.mjs';
import * as fields from '/pages/src/fields.mjs';

let availableMods = await common.rpc.getAvailableMods();
let o101Mod = availableMods.find(x => x.id == "o101_s4z_mods");
let o101common;
let modPath;
async function geto101() {
    if (o101Mod.enabled && zen.checkVersion("1.1.4",o101Mod.manifest.version) <= 0) {
        modPath = o101Mod.modPath.split("\\").at(-1)
        o101common = await import("/mods/" + modPath + "/pages/src/o101/common.mjs")
        //debugger
    }
}
//await geto101();
modPath = await zen.geto101();


let routeInfo = false;
let inProgress = false;
let deltas = [0];
 
export async function main() {
    common.initInteractionListeners(); 

    common.subscribe('athlete/watching', processWatching);
    debugger
}

async function processWatching(watching) {
    debugger
    if ((!routeInfo || watching.state.routeId != routeInfo.routeFullData.id) && !inProgress)
    {
        //console.log("Getting segments on route")
        //debugger
        inProgress = true;        
        if (watching.state.eventSubgroupId != 0) 
        {
            let sg = await common.rpc.getEventSubgroup(watching.state.eventSubgroupId)
            if (sg.distanceInMeters) {
                routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId, 0, sg.distanceInMeters) 
            } else if (sg.laps > 1) {
                routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId, sg.laps ) 
            } else {
                routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId) 
            }         
            
        } else {
            routeInfo = await zen.processRoute(watching.state.courseId, watching.state.routeId) 
        }
        console.log(routeInfo)   
        debugger
        inProgress = false;
    }
    else {
        debugger
        let xCoord = zen.getxCoord(watching, routeInfo);
        let distDelta = watching.state.eventDistance - xCoord;
        deltas.push(distDelta);
        if (deltas.length > 20)
        {            
            deltas.shift();            
        }        
        //console.log(xCoord, watching.state.eventDistance, deltas.reduce((a, b) => a + b, 0) / deltas.length);
    }
}

