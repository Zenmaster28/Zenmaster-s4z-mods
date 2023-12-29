import * as common from '/pages/src/common.mjs';

let routeSegments = [];
let allMarkLines = [];
let lapStartIdx;
let routeLeadinDistance;
let routeFullData = false;

export async function getSegmentsOnRoute(courseId, routeId, eventSubgroupId) {     
    routeSegments.length = 0;
    allMarkLines.length = 0;
    let foundSegmentStart = false;
    let foundSegmentEnd = false;
    let includeSegment = false;
    let ignoreSegment = false;        
    let curvePathIndex = 0;
    let laps = 1;
    let sgInfo;
    let worldSegments = await common.rpc.getSegments(courseId)
    //debugger
    routeFullData = await common.getRoute(routeId); 
    //console.log(routeFullData) 
    if (eventSubgroupId != 0)
    {
        sgInfo = await common.rpc.getEventSubgroup(eventSubgroupId);
        laps = sgInfo.laps;        
    }
    console.log("Lap count: " + laps)
    const notLeadin = routeFullData.manifest.findIndex(x => !x.leadin); 
    lapStartIdx = notLeadin === -1 ? 0 : routeFullData.curvePath.nodes.findIndex(x => x.index === notLeadin);  

    let zwiftSegmentsRequireStartEnd = await fetch("data/segRequireStartEnd.json").then((response) => response.json());        
    //let allRoutes = await common.rpc.getRoutes();
    for (let roadIndex in routeFullData.roadSegments)
    {
        let thisRoad = routeFullData.roadSegments[roadIndex];     
        
        if (typeof thisRoad.reverse === 'undefined')
        {
            thisRoad.reverse = false;            
        }        
        //console.log("Road segment: " + roadIndex + " roadId: " + thisRoad.roadId + " direction: " + thisRoad.reverse);       
        let segmentsOnRoad = worldSegments.filter(x => (x.roadId == thisRoad.roadId));
        if (segmentsOnRoad.length > 0)
        {
            for (let segment of segmentsOnRoad)
            {             
                ignoreSegment = false;
                if (segment.roadStart == null || segment.reverse != thisRoad.reverse) //ignore segments with no start and segment direction and road must match
                {                        
                    ignoreSegment = true;
                }                 
                includeSegment = false;
                foundSegmentStart = thisRoad.includesRoadPercent(segment.roadStart);  
                foundSegmentEnd = thisRoad.includesRoadPercent(segment.roadFinish);                
                if (zwiftSegmentsRequireStartEnd.includes(segment.id))
                {
                    if (foundSegmentStart && foundSegmentEnd)
                    {
                        
                        includeSegment = true;                            
                    } 
                }
                else if (foundSegmentStart || foundSegmentEnd)
                {
                    includeSegment = true;
                }                    
                if (includeSegment && !ignoreSegment)
                {                        
                    let newSegment = {...segment}
                    newSegment.bounds = thisRoad.boundsAtRoadPercent(segment.roadStart);
                    newSegment.bounds.curvePathIndex = curvePathIndex;
                    newSegment.bounds.roadSegment = parseInt(roadIndex);
                    newSegment.boundsFinish = thisRoad.boundsAtRoadPercent(segment.roadFinish);
                    newSegment.boundsFinish.curvePathIndex = curvePathIndex;
                    newSegment.boundsFinish.roadSegment = parseInt(roadIndex);
                    newSegment.leadin = thisRoad.leadin ?? false;                        
                    let originIndex = findNodesIndex(thisRoad, newSegment.bounds.origin, newSegment.bounds.next, thisRoad.reverse, curvePathIndex); 
                    let originFinishIndex = findNodesIndex(thisRoad, newSegment.boundsFinish.origin, newSegment.boundsFinish.next, thisRoad.reverse, curvePathIndex); 
                    newSegment.bounds.originIndex = originIndex; 
                    newSegment.boundsFinish.originIndex = originFinishIndex;                    
                    newSegment.bounds.markLines = [];
                    newSegment.boundsFinish.markLines = [];
                                                   
                    if (originIndex != -1 && (
                            routeSegments.length == 0 || 
                            (newSegment.bounds.roadSegment - 1 != routeSegments[routeSegments.length - 1].bounds.roadSegment ||
                                newSegment.name != routeSegments[routeSegments.length - 1].name
                            )
                        ))
                    {                            
                        routeSegments.push(newSegment);
                    }
                    else if (originIndex = -1 && foundSegmentEnd && (routeSegments.length == 0 || newSegment.bounds.roadSegment - 1 != routeSegments[routeSegments.length - 1].bounds.roadSegment)) // didn't match the start of the segment but found the end AND it's not on the list of segments requiring the start and end.  We must be in Scotland....
                    {
                        //debugger
                        routeSegments.push(newSegment);
                    }
                }
                else
                {
                    //console.log("Not including segment: " + segment.name + " due to includeSegment: " + includeSegment + " and/or ignoreSegment: " + ignoreSegment)
                }
            }
        }
        curvePathIndex += thisRoad.nodes.length;
    }
    //debugger
    //console.log(routeSegments)   
    const distances = Array.from(routeFullData.distances);
    const elevations = Array.from(routeFullData.elevations);
    const grades = Array.from(routeFullData.grades);
    if (lapStartIdx) {        
        routeLeadinDistance = distances[lapStartIdx];
    } else {
        routeLeadinDistance = 0;
    }
    for (let segment of routeSegments)
    {   
        let percentOffset;
        let boundsLineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;        
        segment.reverse ? percentOffset = (1 - segment.bounds.percent) : percentOffset = segment.bounds.percent;
        let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
        let markLineIndex = distances[boundsLineIndex] + indexOffset                
        allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})  // segment start lines

        boundsLineIndex = segment.boundsFinish.curvePathIndex + segment.boundsFinish.originIndex;
        segment.reverse ? percentOffset = (1 - segment.boundsFinish.percent) : percentOffset = segment.boundsFinish.percent;
        if (boundsLineIndex < distances.length - 1)
        {
            indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset
        }
        else
        {
            indexOffset = 0;
        }
        markLineIndex = distances[boundsLineIndex] + indexOffset        
        allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id})  // segment finish line  
    }

    const lapDistance = distances.at(-1) - distances[lapStartIdx];
    for (let lap = 1; lap < laps; lap++) {
        routeFullData.curvePath.extend(routeFullData.curvePath.slice(lapStartIdx));
        for (let i = lapStartIdx; i < routeFullData.distances.length; i++) {
            distances.push(distances.at(-1) + (routeFullData.distances[i] - (routeFullData.distances[i - 1] || 0)));
            elevations.push(routeFullData.elevations[i]);
            grades.push(routeFullData.grades[i]);            
        }
        for (let segment of routeSegments)
        {                    
            if (segment.leadin)
            {
                continue;
            }                                   
            let percentOffset;
            let boundsLineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;
            segment.reverse ? percentOffset = (1 - segment.bounds.percent) : percentOffset = segment.bounds.percent;
            let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
            let markLineIndex = (lapDistance * lap) + distances[boundsLineIndex] + indexOffset;                    
            allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})  // segment start lines
            boundsLineIndex = segment.boundsFinish.curvePathIndex + segment.boundsFinish.originIndex;
            segment.reverse ? percentOffset = (1 - segment.boundsFinish.percent) : percentOffset = segment.boundsFinish.percent;
            if (boundsLineIndex < routeFullData.distances.length - 1)
            {
                indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset
            }
            else
            {
                indexOffset = 0;
            }
            markLineIndex = (lapDistance * lap) + distances[boundsLineIndex] + indexOffset
            allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id})  // segment finish line
        }
    }
    routeFullData.distances = distances;
    routeFullData.elevations = elevations;
    routeFullData.grades = grades;
    allMarkLines.sort((a, b) => {
        return a.markLine - b.markLine;
    });
    //console.log(allMarkLines);
    let routeInfo = {
        routeFullData: routeFullData,
        segments: routeSegments,
        markLines: allMarkLines
    }
    let tf = await common.getRoute(2128890027)
    debugger
    return routeInfo;
}

function findNodesIndex(roadSegmentData, origin, next, reverse, startIndex) {        
for (let i = 0; i < roadSegmentData.nodes.length; i++) {
    if (reverse)
    {             
        let reversedData = roadSegmentData.nodes.slice(0);   
        reversedData.reverse();
        const currentNode = reversedData[i];
        const nextNode = reversedData[i + 1];
        const prevNode = reversedData[i - 1];
        if (typeof prevNode !== 'undefined')
        {           
            if (                        
                compareProperties(currentNode.end, origin.end) &&            
                compareProperties(currentNode.cp1, origin.cp1) &&
                compareProperties(currentNode.cp2, origin.cp2)
            )
            {                        
                return i - 1; // i - 1 seems to work better for reverse segments                        
            }
        }
    }
    // Check if origin properties match
    else {
        const currentNode = roadSegmentData.nodes[i];
        if (
            compareProperties(currentNode.end, origin.end) &&            
            compareProperties(currentNode.cp1, origin.cp1) &&
            compareProperties(currentNode.cp2, origin.cp2)
        ) {
            return i; 
            
        }
    }
}
  
    return -1; // Return -1 if not found
}

function compareProperties(obj1, obj2) {
    if (!obj1 || !obj2) {
      return true; // If either object is undefined or null, consider them equal
    }
  
    return Object.keys(obj1).every((key) => obj2.hasOwnProperty(key) && obj1[key] === obj2[key]);
}

export function getxCoord(watching) {
    let roadSeg;
    let nodeRoadOfft;
    let distance;
    let nodes = routeFullData.curvePath.nodes;
    if (watching.state.eventSubgroupId != 0) {        
        distance = watching.state.eventDistance;
    } else {
        // Outside of events state.progress represents the progress of single lap.
        // However, if the lap counter is > 0 then the progress % does not include
        // leadin.
        const floor = watching.state.laps ? routeLeadinDistance : 0;
        const totDist = routeFullData.distances[routeFullData.distances.length - 1];
        distance = watching.state.progress * (totDist - floor) + floor;
    }
    const nearIdx = common.binarySearchClosest(routeFullData.distances, distance);
    const nearRoadSegIdx = nodes[nearIdx].index;
    roadSearch:
    for (let offt = 0; offt < 12; offt++) {
        for (const dir of [1, -1]) {
            const segIdx = nearRoadSegIdx + (offt * dir);
            const s = routeFullData.roadSegments[segIdx];
            if (s && s.roadId === watching.state.roadId && !!s.reverse === !!watching.state.reverse &&
                s.includesRoadTime(watching.state.roadTime)) {
                roadSeg = s;
                // We found the road segment but need to find the exact node offset
                // to support multi-lap configurations...
                for (let i = nearIdx; i >= 0 && i < nodes.length; i += dir) {
                    if (nodes[i].index === segIdx) {
                        // Rewind to first node of this segment.
                        while (i > 0 && nodes[i - 1].index === segIdx) {
                            i--;
                        }
                        nodeRoadOfft = i;
                        break;
                    }
                }
                break roadSearch;
            }
        }
    } 
    if (!roadSeg) {
        // Not on our route but might be nearby..
        const i = routeFullData.roadSegments.findIndex(x =>
            x.roadId === watching.state.roadId &&
            !!x.reverse === !!watching.state.reverse &&
            x.includesRoadTime(watching.state.roadTime));
        if (i === -1) {
            return null;
        }
        roadSeg = routeFullData.roadSegments[i];
        nodeRoadOfft = nodes.findIndex(x => x.index === i);        
    }
    if (roadSeg)   
    {
        const bounds = roadSeg.boundsAtRoadTime(watching.state.roadTime);
        const nodeOfft = roadSeg.reverse ?
            roadSeg.nodes.length - 1 - (bounds.index + bounds.percent) :
            bounds.index + bounds.percent;
        const xIdx = nodeRoadOfft + nodeOfft;
        if (xIdx < 0 || xIdx > routeFullData.distances.length - 1) {
            console.error("route index offset bad!", {xIdx});
            return null;
        }
        let xCoord;
        if (xIdx % 1) {
            const i = xIdx | 0;
            const dDelta = routeFullData.distances[i + 1] - routeFullData.distances[i];        
            xCoord = routeFullData.distances[i] + dDelta * (xIdx % 1);        
        } else {
            xCoord = routeFullData.distances[xIdx];        
        }
        if (isNaN(xCoord) || xCoord == null) {
            console.error('xCoord is NaN');
        }
        return xCoord;
    }
    else {
        return -1;
    }
}