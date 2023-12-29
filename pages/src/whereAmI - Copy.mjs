import * as common from '/pages/src/common.mjs';
import * as coords from './segments-xCoord.mjs';

let routeInfo = false;
let inProgress = false;
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
        routeInfo = await coords.getSegmentsOnRoute(watching.state.courseId, watching.state.routeId, watching.state.eventSubgroupId) 
        console.log(routeInfo)       
        inProgress = false;
    }
    else {
        //let xCoord = coords.getxCoord(watching);
        //console.log(xCoord, watching.segmentData.currentPosition);
    }
}
