import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';


let routeInfo = false;
let inProgress = false;
let deltas = [0];
 
export async function main() {
    common.initInteractionListeners(); 

    common.subscribe('athlete/watching', processWatching);
}

async function processWatching(watching) {
    
    if ((!routeInfo || watching.state.routeId != routeInfo.routeFullData.id) && !inProgress)
    {
        console.log("Getting segments on route")
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
        //debugger
        inProgress = false;
    }
    else {
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

