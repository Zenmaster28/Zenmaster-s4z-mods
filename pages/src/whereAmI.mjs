import * as common from '/pages/src/common.mjs';
import * as coords from './segments-xCoord.mjs';

let routeInfo = false;
let inProgress = false;
let deltas = [0];
//debugger;

export async function main() {
    common.initInteractionListeners(); 

    common.subscribe('athlete/watching', processWatching);
}

async function processWatching(watching) {
    if ((!routeInfo || watching.state.routeId != routeInfo.routeFullData.id) && !inProgress)
    {
        console.log("Getting segments on route")
        inProgress = true;
        //routeInfo = await coords.getSegmentsOnRoute(watching.state.courseId, watching.state.routeId, watching.state.eventSubgroupId) 
        
        //routeInfo = await coords.processRoute(watching.state.courseId, 2139708890)
        if (watching.state.eventSubgroupId != 0) 
        {
            let sg = await common.rpc.getEventSubgroup(watching.state.eventSubgroupId)
            if (sg.distanceInMeters) {
                routeInfo = await coords.processRoute(watching.state.courseId, watching.state.routeId, 0, sg.distanceInMeters) 
            } else if (sg.laps > 1) {
                routeInfo = await coords.processRoute(watching.state.courseId, watching.state.routeId, sg.laps ) 
            } else {
                routeInfo = await coords.processRoute(watching.state.courseId, watching.state.routeId) 
            }

            //console.log(sg)
            
        } else {
            routeInfo = await coords.processRoute(watching.state.courseId, watching.state.routeId) 
        }
        console.log(routeInfo)   
        //debugger    
        inProgress = false;
    }
    else {
        let xCoord = coords.getxCoord(watching, routeInfo);
        let distDelta = watching.state.eventDistance - xCoord;
        deltas.push(distDelta);
        if (deltas.length > 20)
        {            
            deltas.shift();
            //debugger
        }
        //debugger
        console.log(xCoord, watching.state.eventDistance, deltas.reduce((a, b) => a + b, 0) / deltas.length);
    }
}

const sum = deltas.reduce((a, b) => a + b, 0);
const avg = (sum / deltas.length) || 0;

function average(nums) {
    return nums.reduce((a, b) => (a + b) / nums.length);
}