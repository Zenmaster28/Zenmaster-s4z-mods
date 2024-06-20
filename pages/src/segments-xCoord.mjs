import * as common from '/pages/src/common.mjs';
import * as curves from '/shared/curves.mjs';


let routeSegments = [];
let allMarkLines = [];
let lapStartIdx;
let routeLeadinDistance;
let routeFullData = false;
let worldSegments;
let curvePathIndex = 0;
let zwiftSegmentsRequireStartEnd;
let missingLeadinRoutes = await fetch("data/missingLeadinRoutes.json").then((response) => response.json()); 
let replacementLeadins = await fetch("data/leadinData.json").then((response) => response.json());

export async function processRoute(courseId, routeId, laps, distance, includeLoops) { 
    distance = parseInt(distance);
    curvePathIndex = 0;   
    routeSegments.length = 0;
    allMarkLines.length = 0;   
    //routeFullData = await common.getRoute(routeId);
    if (includeLoops) {

    } else {
        includeLoops = false;
    }        
    routeFullData = await getModifiedRoute(routeId); 
    worldSegments = await common.rpc.getSegments(courseId);
    zwiftSegmentsRequireStartEnd = await fetch("data/segRequireStartEnd.json").then((response) => response.json());
    
    const distances = Array.from(routeFullData.distances);
    const elevations = Array.from(routeFullData.elevations);
    const grades = Array.from(routeFullData.grades);
    const roadSegments = Array.from(routeFullData.roadSegments);
    const notLeadin = routeFullData.manifest.findIndex(x => !x.leadin);
    const notLeadinRoadSegments = routeFullData.roadSegments.findIndex(x => !x.leadin);
    const lapStartIdx = notLeadin === -1 ? 0 : routeFullData.curvePath.nodes.findIndex(x => x.index === notLeadin);            
    if (lapStartIdx) {        
        routeLeadinDistance = distances[lapStartIdx];
    } else {
        routeLeadinDistance = 0;
    }
    if (distance) {
        laps = routeFullData.supportedLaps ? Infinity : 1;
    }
    if (laps > 1 && !routeFullData.supportedLaps) {
        laps = 1;
    }
    for (let lap = 1; lap < laps; lap++) {
        routeFullData.curvePath.extend(routeFullData.curvePath.slice(lapStartIdx));
        for (let i = lapStartIdx; i < routeFullData.distances.length; i++) {
            distances.push(distances.at(-1) +
                (routeFullData.distances[i] - (routeFullData.distances[i - 1] || 0)));
            elevations.push(routeFullData.elevations[i]);
            grades.push(routeFullData.grades[i]);
        }  
        for (let j = notLeadinRoadSegments; j < routeFullData.roadSegments.length; j++) {  
            let roadSegmentClone = Object.assign(Object.create(Object.getPrototypeOf(routeFullData.roadSegments[j])), routeFullData.roadSegments[j])  
            roadSegmentClone.lap = lap + 1;        
            roadSegments.push(roadSegmentClone);            
            //roadSegments[roadSegments.length - 1].lap = lap + 1;
        }
        if (distance && distances[distances.length - 1] >= distance) {
            break;
        }
    }
    if (distance) {
        while (distances[distances.length - 1] > distance + 200) {
            distances.pop();
            elevations.pop();
            grades.pop();
        }
    }
    //debugger
    routeFullData.distances = distances;
    routeFullData.elevations = elevations;
    routeFullData.grades = grades;
    routeFullData.roadSegments = roadSegments; 
    let rsIdx = 0;   
    for (let roadSegment of routeFullData.roadSegments)
    {
        let segments = findSegmentsOnRoadSection(roadSegment, curvePathIndex, rsIdx);
        //console.log(rsIdx, roadSegment.reverse, roadSegment.roadId, segments)
        if (segments.length > 0 && routeSegments.length > 0) {
            //debugger
            segments.sort((a,b) => {
                return a.roadStart - b.roadStart;
            })
            for (let segment of segments) {
                
                //if (segment.roadId == 9) {debugger}
                if (segment.id != routeSegments[routeSegments.length - 1].id ||
                    (rsIdx - 1 != routeSegments[routeSegments.length - 1].roadSegmentIndex) ||
                    ((routeSegments[routeSegments.length - 1].matchedStart && routeSegments[routeSegments.length - 1].matchedEnd) &&
                    (segment.matchedStart && segment.matchedEnd))
                    ) {
                    // make sure we didn't match this same segment on the last roadSegment as it would be a duplicate (probably Fuego Flats)
                    if (!includeLoops && (segment.name.toLowerCase().includes("loop") || (segment.archId == null) || segment.roadStart == segment.roadFinish)) {
                        //don't include loops if not specified
                    } else {
                        routeSegments.push(segment);
                    }
                } else {                    
                    //console.log("Skipping duplicate segment match " + segment.name + " on roadSegmentIndex " + rsIdx)
                    //debugger
                } 
            }          
        } else if (segments.length > 0) {
            for (let segment of segments) {
                
                if (!includeLoops && (segment.name.toLowerCase().includes("loop") || (segment.archId == null) || segment.roadStart == segment.roadFinish)) {
                    //don't include loops if not specified
                } else {
                    routeSegments.push(segment)
                }
            }
        }
        curvePathIndex += roadSegment.nodes.length;
        rsIdx++;
    }    
    for (let segment of routeSegments)
    {
        let markLines = getSegmentMarkline(segment);
        if (markLines)
        {
            
            for (let i = 0; i < markLines.length; i++) {
                isNaN(markLines[i].markLine) ? "" : allMarkLines.push(markLines[i]);
            }
        }
        //debugger
    }
    //debugger
    let segmentRepeatCheck = routeSegments.filter(x => x.repeat > 1);
    let segmentRepeats;
    segmentRepeatCheck.length > 0 ? segmentRepeats = true : segmentRepeats = false;
    
    const routeInfo = {
        routeFullData: routeFullData,
        segments: routeSegments,
        markLines: allMarkLines,
        segmentRepeats
    }
    console.log(routeInfo)
    //debugger
    return routeInfo;
}

function findSegmentsOnRoadSection(thisRoad, cpIndex, rsIdx) {
    typeof thisRoad.reverse === 'undefined' ? thisRoad.reverse = false : "";
    typeof thisRoad.lap === 'undefined' ? thisRoad.lap = 1 : "";
    const segmentsOnRoad = worldSegments.filter(x => (x.roadId == thisRoad.roadId));
    let roadSegments = [];    
    if (segmentsOnRoad.length > 0) {
        // there are segments on this road, check if they match this roadSection
        //console.log("Found " + segmentsOnRoad.length + " possible segments on this road")
        for (let segment of segmentsOnRoad) {
            if (segment.roadStart == null || segment.reverse != thisRoad.reverse) {
                // skip segments with no roadStart value and the segment and road direction must match
                continue;
            }
            segment.id == "1065262910" ? segment.id = "18245132094" : ""; // leg snapper segment id workaround
            let includeSegment = false;            
            let foundSegmentStart = thisRoad.includesRoadPercent(segment.roadStart);  // does the roadSection go through the start of the segment
            let foundSegmentEnd = thisRoad.includesRoadPercent(segment.roadFinish); // does the roadSection go through the end of the segment
            if (zwiftSegmentsRequireStartEnd.includes(segment.id)) {
                if (foundSegmentStart && foundSegmentEnd) {
                    // segment is flagged as requiring the roadSection to go through both the start and end of segment and it does!                    
                    includeSegment = true;                            
                } 
            }
            else if (foundSegmentStart || foundSegmentEnd) {
                // segment only requires going through start or end and it does
                includeSegment = true;
            }
            if (includeSegment) {
                let newSegment = {...segment}
                newSegment.bounds = thisRoad.boundsAtRoadPercent(segment.roadStart);
                newSegment.bounds.curvePathIndex = cpIndex;
                //newSegment.bounds.roadSegment = parseInt(roadIndex);
                newSegment.boundsFinish = thisRoad.boundsAtRoadPercent(segment.roadFinish);
                newSegment.boundsFinish.curvePathIndex = cpIndex;
                //newSegment.boundsFinish.roadSegment = parseInt(roadIndex);
                newSegment.leadin = thisRoad.leadin ?? false;                        
                let originIndex = findNodesIndex(thisRoad, newSegment.bounds.origin, newSegment.bounds.next, thisRoad.reverse, cpIndex); 
                let originFinishIndex = findNodesIndex(thisRoad, newSegment.boundsFinish.origin, newSegment.boundsFinish.next, thisRoad.reverse, cpIndex); 
                newSegment.bounds.originIndex = originIndex; 
                newSegment.boundsFinish.originIndex = originFinishIndex;                    
                newSegment.bounds.markLines = [];
                newSegment.boundsFinish.markLines = [];
                newSegment.lap = thisRoad.lap;
                newSegment.matchedStart = foundSegmentStart;
                newSegment.matchedEnd = foundSegmentEnd;
                let segmentRepeats = routeSegments.filter(x => x.id == newSegment.id)
                if (segmentRepeats.length > 0) {
                    // found a repeated segment
                    //debugger 
                    newSegment.repeat = segmentRepeats.length + 1;
                } else {
                    newSegment.repeat = 1;
                }
                newSegment.roadSegmentIndex = rsIdx;
                if (originIndex != -1 && (
                        routeSegments.length == 0 || 
                        (newSegment.bounds.roadSegment - 1 != routeSegments[routeSegments.length - 1].bounds.roadSegment ||
                            newSegment.name != routeSegments[routeSegments.length - 1].name
                        )
                    ))
                {                            
                    //routeSegments.push(newSegment);
                    roadSegments.push(newSegment);
                    //return newSegment;
                }
                else if (originIndex = -1 && foundSegmentEnd && (routeSegments.length == 0 || newSegment.bounds.roadSegment - 1 != routeSegments[routeSegments.length - 1].bounds.roadSegment)) // didn't match the start of the segment but found the end AND it's not on the list of segments requiring the start and end.  We must be in Scotland....
                {
                    //debugger
                    //routeSegments.push(newSegment);
                    roadSegments.push(newSegment);
                    //return newSegment;
                } else {
                    console.log("Segment ignored for some reason...")
                    //debugger
                }

            }
        }
    }
    
    return roadSegments;
}

function getSegmentMarkline(segment) {
    const distances = Array.from(routeFullData.distances);
    let percentOffset;
    let boundsLineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;        
    segment.reverse ? percentOffset = (1 - segment.bounds.percent) : percentOffset = segment.bounds.percent;
    let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
    let markLineIndex = distances[boundsLineIndex] + indexOffset                
    //allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})  // segment start lines
    const markLineStart = {
        name: segment.name, 
        markLine: markLineIndex, 
        id: segment.id, 
        repeat: segment.repeat, 
        segLength: segment.distance
    };

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
    let markLineIndexFinish = distances[boundsLineIndex] + indexOffset        
    //allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id})  // segment finish line  
    const markLineFinish = {
        name: segment.name + " Finish", 
        markLine: markLineIndexFinish, 
        id: segment.id, 
        repeat: segment.repeat, 
        segLength: segment.distance,
    };
    return [markLineStart,markLineFinish];
}


export async function getSegmentsOnRoute(courseId, routeId, eventSubgroupId) {     
    routeSegments.length = 0;
    allMarkLines.length = 0;
    let foundSegmentStart = false;
    let foundSegmentEnd = false;
    let includeSegment = false;
    let ignoreSegment = false;        
    let curvePathIndex = 0;
    let laps = 1;
    let customDistance = 0;
    let sgInfo;
    let leadinIncluded = false;
    let worldSegments = await common.rpc.getSegments(courseId)
    
    //routeFullData = await common.getRoute(routeId); 
    routeFullData = await getModifiedRoute(routeId); 
    //debugger
    //console.log(routeFullData) 
    if (eventSubgroupId != 0 && typeof(eventSubgroupId) != "undefined")
    {
        sgInfo = await common.rpc.getEventSubgroup(eventSubgroupId);
        if (sgInfo) {
            sgInfo.distanceInMeters ? customDistance = sgInfo.distanceInMeters : "";
        }
        if (customDistance > 0)
        {
            //let leadinDistance = routeFullData.leadinDistanceInMeters;
            if ((routeFullData.roadSegments.filter(x => x.leadin)).length > 0)
            {
                leadinIncluded = true;
            }
            else 
            {
                //customDistance = customDistance - routeFullData.leadinDistanceInMeters;
            }
            let cdIdx = routeFullData.distances.findIndex(x => x > customDistance)
            //console.log("Custom Distance: " + customDistance + " at index " + cdIdx)
            routeFullData.distances = routeFullData.distances.slice(0,cdIdx)
            routeFullData.elevations = routeFullData.elevations.slice(0,cdIdx)
            routeFullData.grades = routeFullData.grades.slice(0,cdIdx)
            routeFullData.curvePath.nodes = routeFullData.curvePath.nodes.slice(0,cdIdx)
            //debugger
        }
        if (sgInfo) {
            laps = sgInfo.laps;        
        }
    }
    //console.log("Lap count: " + laps)
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
            segmentsOnRoad.sort((a,b) => {
                return a.roadStart - b.roadStart;
            })
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
        allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id, repeat: segment.repeat})  // segment start lines

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
        allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id, repeat: segment.repeat})  // segment finish line  
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
            allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id, repeat: segment.repeat})  // segment start lines
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
            allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id, repeat: segment.repeat})  // segment finish line
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

export function getxCoord(watching, routeInfo) {
    let roadSeg;
    let nodeRoadOfft;
    let distance;
    let nodes = routeInfo.routeFullData.curvePath.nodes;
    if (watching.state.eventSubgroupId != 0) {        
        distance = watching.state.eventDistance;
    } else {
        // Outside of events state.progress represents the progress of single lap.
        // However, if the lap counter is > 0 then the progress % does not include
        // leadin.
        const floor = watching.state.laps ? routeLeadinDistance : 0;
        const totDist = routeInfo.routeFullData.distances[routeFullData.distances.length - 1];
        distance = watching.state.progress * (totDist - floor) + floor;
        //debugger
    }
    
    const nearIdx = common.binarySearchClosest(routeInfo.routeFullData.distances, distance);
    const nearRoadSegIdx = nodes[nearIdx].index;
    roadSearch:
    for (let offt = 0; offt < 12; offt++) {
        for (const dir of [1, -1]) {
            const segIdx = nearRoadSegIdx + (offt * dir);
            const s = routeInfo.routeFullData.roadSegments[segIdx];
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
        const i = routeInfo.routeFullData.roadSegments.findIndex(x =>
            x.roadId === watching.state.roadId &&
            !!x.reverse === !!watching.state.reverse &&
            x.includesRoadTime(watching.state.roadTime));
        if (i === -1) {
            return null;
        }
        roadSeg = routeInfo.routeFullData.roadSegments[i];
        nodeRoadOfft = nodes.findIndex(x => x.index === i);        
    }
    if (roadSeg)   
    {
        const bounds = roadSeg.boundsAtRoadTime(watching.state.roadTime);
        const nodeOfft = roadSeg.reverse ?
            roadSeg.nodes.length - 1 - (bounds.index + bounds.percent) :
            bounds.index + bounds.percent;
        const xIdx = nodeRoadOfft + nodeOfft;
        if (xIdx < 0 || xIdx > routeInfo.routeFullData.distances.length - 1) {
            console.error("route index offset bad!", {xIdx});
            return null;
        }
        let xCoord;
        if (xIdx % 1) {
            const i = xIdx | 0;
            const dDelta = routeInfo.routeFullData.distances[i + 1] - routeInfo.routeFullData.distances[i];        
            xCoord = routeInfo.routeFullData.distances[i] + dDelta * (xIdx % 1);        
        } else {
            xCoord = routeInfo.routeFullData.distances[xIdx];        
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


function supplimentPath(worldMeta, curvePath, {physicsSlopeScale}={}) {
    const balancedT = 1 / 125; // tests to within 0.27 meters (worst case)
    const distEpsilon = 1e-6;
    const elevations = [];
    const grades = [];
    const distances = [];
    let prevIndex;
    let distance = 0;
    let prevDist = 0;
    let prevEl = 0;
    let prevNode;
    curvePath.trace(x => {
        distance += prevNode ? curves.vecDist(prevNode, x.stepNode) / 100 : 0;
        if (x.index !== prevIndex) {
            const elevation = worldMeta ?
                zToAltitude(worldMeta, x.stepNode[2], {physicsSlopeScale}) :
                x.stepNode[2] / 100 * (physicsSlopeScale || 1);
            if (elevations.length) {
                if (distance - prevDist > distEpsilon) {
                    const grade = (elevation - prevEl) / (distance - prevDist);
                    grades.push(grade);
                } else {
                    grades.push(grades.at(-1) || 0);
                }
            }
            distances.push(distance);
            elevations.push(elevation);
            prevDist = distance;
            prevEl = elevation;
            prevIndex = x.index;
        }
        prevNode = x.stepNode;
    }, balancedT);
    grades.unshift(grades[0]);
    return {
        elevations,
        grades,
        distances,
    };
}

function zToAltitude(worldMeta, z, {physicsSlopeScale}={}) {
    return worldMeta ? (z + worldMeta.waterPlaneLevel) / 100 *
        (physicsSlopeScale || worldMeta.physicsSlopeScale) + worldMeta.altitudeOffsetHack : null;
}

export async function getAllRoutes() {
    let allRoutes = [];
    let sauceRoutes = await common.rpc.getRoutes();
    let zenRoutes = await fetch("data/routes.json").then((response) => response.json());
    for (let route of zenRoutes) {
        let match = sauceRoutes.find(x => x.id == route.id)
        //debugger
        if (match) {
            allRoutes.push(match)
        } else {
            allRoutes.push(route)
        }
    }
    return allRoutes;
}

export async function getRoadSegments(courseId, roadId, reverse) {
    let worldSegments = await common.rpc.getSegments(courseId)
    let roadSegments = worldSegments.filter(x => x.roadId == roadId && x.reverse == reverse)
    let thisRoad = await common.getRoad(courseId, roadId)
    for (let segment of roadSegments) {
        segment.bounds = thisRoad.curvePath.boundsAtRoadPercent(segment.roadStart)
        segment.boundsFinish = thisRoad.curvePath.boundsAtRoadPercent(segment.roadFinish)
        let marklines = await getRoadSegmentMarkline(segment, thisRoad)
        segment.markLines = marklines
        //debugger
    }
    return roadSegments
    //debugger
}

async function getRoadSegmentMarkline(segment, thisRoad) {    
    const distances = Array.from(thisRoad.distances);
    let percentOffset;
    let boundsLineIndex = segment.bounds.index
    segment.reverse ? percentOffset = (segment.bounds.percent) : percentOffset = segment.bounds.percent;
    let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
    let markLineIndex = distances[boundsLineIndex] + indexOffset                
    //allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})  // segment start lines
    //debugger
    const markLineStart = {
        name: segment.name, 
        markLine: markLineIndex, 
        id: segment.id, 
        repeat: segment.repeat, 
        segLength: segment.distance
    };

    boundsLineIndex = segment.boundsFinish.index
    segment.reverse ? percentOffset = (segment.boundsFinish.percent) : percentOffset = segment.boundsFinish.percent;
    if (boundsLineIndex < distances.length - 1)
    {
        indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset
    }
    else
    {
        indexOffset = 0;
    }
    let markLineIndexFinish = distances[boundsLineIndex] + indexOffset        
    //allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id})  // segment finish line  
    const markLineFinish = {
        name: segment.name + " Finish", 
        markLine: markLineIndexFinish, 
        id: segment.id, 
        repeat: segment.repeat, 
        segLength: segment.distance,
    };
    return [markLineStart,markLineFinish];
}

export async function getModifiedRoute(id) {                   
        let route = await common.rpc.getRoute(id);
        if (!route) {
            console.log("Route not found in Sauce, checking json")
            let newRoutes = await fetch("data/routes.json").then((response) => response.json()); 
            route = newRoutes.find(x => x.id == id)
            if (!route) {
                console.log("No matching route found, switching to road view")
                return -1
            } else {
                console.log("Found route", route.name, "in json")
                route.courseId = common.worldToCourseIds[route.worldId]
            }
            //debugger
        }
        let missing = missingLeadinRoutes.filter(x => x.id == id)
                
        let replacementLeadin =  replacementLeadins.filter(x => 
            x.eventPaddocks == route.eventPaddocks && x.courseId == route.courseId && (x.roadId == route.manifest.find(m => !m.hasOwnProperty('leadin') || !m.leadin)?.roadId) && (x.reverse == (route.manifest.find(m => !m.hasOwnProperty('leadin') || !m.leadin)?.reverse ?? false))
        ) 
        //debugger
        if (replacementLeadin.length > 0) {
            console.log("Found a matching replacement leadin!")
        } else {
            console.log("No matching replacement leadin")
        }
        let leadin;        
        if (missing.length > 0 || replacementLeadin.length > 0) {
            //replacementLeadin = await common.rpc.getRoute(missing[0].replacement)
            //leadin = replacementLeadin.manifest.filter(x => x.leadin);
            if (replacementLeadin.length > 0) {
                leadin = replacementLeadin[0].leadin
                if (replacementLeadin[0].replace) {
                    route.manifest = route.manifest.filter(x => !x.leadin) // we are replacing the leadin so remove the existing one
                }
                //debugger                
            } else if (missing.length > 0) {
                leadin = missing[0].leadin;
            }
            //debugger
        } else {
            replacementLeadin = [];
            leadin = [];
        }        
        
        for (let i = leadin.length; i > 0; i--) {
            route.manifest.unshift(leadin[i - 1]);
        }
            if (route) {
                route.curvePath = new curves.CurvePath();
                route.roadSegments = [];                
                const worldList = await common.getWorldList();
                const worldMeta = worldList.find(x => x.courseId === route.courseId);
                for (const [i, x] of route.manifest.entries()) {
                    //debugger
                    const road = await common.getRoad(route.courseId, x.roadId);
                    const seg = road.curvePath.subpathAtRoadPercents(x.start, x.end);
                    seg.reverse = x.reverse;
                    seg.leadin = x.leadin;
                    seg.roadId = x.roadId;
                    for (const xx of seg.nodes) {
                        xx.index = i;
                    }
                    route.roadSegments.push(seg);
                    route.curvePath.extend(x.reverse ? seg.toReversed() : seg);
                }
                // NOTE: No support for physicsSlopeScaleOverride of portal roads.
                // But I've not seen portal roads used in a route either.
                Object.assign(route, supplimentPath(worldMeta, route.curvePath));
            }            
            return route;
        
}

export function getNextSegment(arr, number) {
    // Sort the array based on the roadindex property
    if (arr.length == 0) {
        return -1;
    }
    arr.sort((a, b) => a.markLine - b.markLine);

    // Find the first object with a roadindex greater than the given number
    for (let i = 0; i < arr.length; i++) {
        if (arr[i].markLine > number) {
            return arr[i];
        }
    }    
    return -1;
}

export function roadTimeToroadPercent(rt) {
    return (rt - 5000) / 1e6;
}

export function checkVersion(a,b) {
    let x=a.split('.').map(e=> parseInt(e));
    let y=b.split('.').map(e=> parseInt(e));
    let z = "";

    for(let i=0;i<x.length;i++) {
        if(x[i] === y[i]) {
            z+="e";
        } else
        if(x[i] > y[i]) {
            z+="m";
        } else {
            z+="l";
        }
    }
    if (!z.match(/[l|m]/g)) {
      return 0;
    } else if (z.split('e').join('')[0] == "m") {
      return 1;
    } else {
      return -1;
    }
}

//stolen from o101
let _teamColors;
export async function initTeamColors(modPath) {
    const r = await fetch("/mods/" + modPath + "/pages/src/o101/teamcolors.json")    
    if (!r.ok) {
        throw new Error('Failed to get teamcolor data: ' + r.status);
    }
    const data = await r.json();    
    _teamColors = data.map(team => { return {
        key: team.name,
        textColor: team.textColor,
        linearGradientColor1: team.linearGradientColor1,
        linearGradientColor2: team.linearGradientColor2,
        weight: team.weight
    }});
}

export function preferredTeamColor(name) {
    let color = '#FFF';
    let lgColor1 = '#71797E';
    let lgColor2 = '#36454F';
    let weight = '600';
    const team = (name != '')
        ? _teamColors.find(t => name.toLowerCase().indexOf(t.key.toLowerCase())>=0)
        : null;    
    if (team != null) {
        color = team.textColor;
        lgColor1 = team.linearGradientColor1;
        lgColor2 = team.linearGradientColor2;
        if (team.weight != null && team.weight != '') weight = team.weight;
    } else if (name != '') {
        lgColor1 = name.toHex();
        lgColor2 = name.toHex();
    }

    return {name, color, lgColor1, lgColor2, weight};
}

export async function geto101() {
    let availableMods = await common.rpc.getAvailableMods();
    let o101Mod = availableMods.find(x => x.id == "o101_s4z_mods");
    if (o101Mod && (o101Mod.enabled && checkVersion("1.1.4",o101Mod.manifest.version)) <= 0) {
        let modPath = o101Mod.modPath.split("\\").at(-1)
        //o101common = await import("/mods/" + modPath + "/pages/src/o101/common.mjs")
        return modPath;
        //debugger
    } else {
        return null;
    }
}
String.prototype.toHex = function() {
    var hash = 0;
    if (this.length === 0) return hash;
    for (var i = 0; i < this.length; i++) {
        hash = this.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash;
    }
    var color = '#';
    for (var i = 0; i < 3; i++) {
        var value = (hash >> (i * 8)) & 255;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
}
export function fmtTeamBadgeV2(team) {
    if (team != null) {
        const teamColor = preferredTeamColor(team);

        return(fmtTeamBadgeV2Raw(teamColor));
    }

    return '';
}

export function fmtTeamBadgeV2Raw(teamColor) {
    teamColor.name = teamColor.name.toUpperCase();

    return '<div class="info-item-team" style="--o101c:'+teamColor.color+'; --o101lg1:'+teamColor.lgColor1+'; --o101lg2:'+teamColor.lgColor2+'; --weight:'+teamColor.weight+'"><span>'+teamColor.name+'</span></div>';
}

export function buildEventForm() {
    const routeInfo = common.settingsStore.get("routeInfo")
    const segmentsForm = document.getElementById("options") 
    const formTitle = document.getElementById("formTitle") 
    const settings = common.settingsStore.get();
    formTitle.innerHTML = "Segments to include (" + settings.FTSorFAL + ")"  
    let i = 1;
    console.log(routeInfo)
    for (let segment of routeInfo.markLines) {
        if (segment.name.includes("Finish")) {
            let label = document.createElement('label');
            let key = document.createElement('key');
            let input = document.createElement('input');
            input.type = "checkbox";
            input.checked = true;
            input.name = "eventSegData" + "|" + routeInfo.sg + "|" + segment.id + "|" + segment.repeat;
            key.innerHTML = segment.name.replace("Finish","[" + segment.repeat + "]") + ":";
            label.appendChild(key);
            label.appendChild(input);
            segmentsForm.appendChild(label);
            i++;
        }
    }
    //debugger
}
export async function buildPointsForm() {    
    const localRouteInfo = localStorage.getItem("routeInfo")
    let routeInfo;
    let segmentData;
    if (localRouteInfo) {
        routeInfo = JSON.parse(localRouteInfo);
    } else {
        segmentData = (await common.rpc.getAthleteData("watching")).segmentData
        segmentData = segmentData.routeSegments.filter(x => x.type != "custom" && !x.name.includes("Finish"));
    }
    //debugger
    //const routeInfo = common.settingsStore.get("routeInfo")
    const segmentsForm = document.getElementById("options") 
    const formTitle = document.getElementById("formTitle") 
    const settings = common.settingsStore.get();
    formTitle.innerHTML = "Segments to include (" + settings.FTSorFAL + ")"  
    let i = 1;
    console.log(routeInfo)
    for (let segment of segmentData) {
        
            let label = document.createElement('label');
            let key = document.createElement('key');
            let input = document.createElement('input');
            input.type = "checkbox";
            input.checked = true;
            //input.name = "eventSegData" + "|" + routeInfo.sg + "|" + segment.id + "|" + segment.repeat;
            key.innerHTML = segment.name.replace("Finish","[" + segment.repeat + "]") + ":";
            label.appendChild(key);
            label.appendChild(input);
            segmentsForm.appendChild(label);
            i++;
        
    }
    //debugger
}

export function fillArrayWithInterpolatedValues(arr, inc) {
    return arr.flatMap((value, index, array) => {
        if (index === array.length - 1) return [value]; // If it's the last element, no need to interpolate
        const nextValue = array[index + 1];
        const difference = nextValue - value;
        const interpolatedValues = [];
        for (let i = 1; i <= inc; i++) {
            interpolatedValues.push(value + difference * (i / (inc + 1)));
        }
        return [value, ...interpolatedValues];
    });
}

export function generateLapDataTable(laps, sortOrder) {
    // Sort the lap data based on lap counter in ascending or descending order
    let lapData = sortOrder == "desc" ? laps.toReversed() : laps    

    // Start building the HTML table
    let tableHTML = '<table>';
    tableHTML += '<tr><th>Lap</th><th>Time</th><th>Cadence</th><th>HR</th><th>Power</th></tr>';

    // Loop through lap data and generate rows
    lapData.forEach((data, index) => {
        const lapCounter = sortOrder == "desc" ? lapData.length - index : index + 1;
        const activeTime = data.stats.activeTime.toFixed(2);
        const cadenceAvg = data.stats.cadence.avg ? data.stats.cadence.avg.toFixed(2) : 'N/A';
        const draftAvg = data.stats.draft.avg ? data.stats.draft.avg.toFixed(2) : 'N/A';
        const hrAvg = data.stats.hr.avg ? data.stats.hr.avg.toFixed(2) : 'N/A';
        const powerAvg = data.stats.power.avg ? data.stats.power.avg.toFixed(2) : 'N/A';
        const speedAvg = data.stats.speed.avg ? data.stats.speed.avg.toFixed(2) : 'N/A';

        // Append row to the table
        tableHTML += `<tr><td>${lapCounter}</td><td>${activeTime}</td><td>${cadenceAvg}</td><td>${hrAvg}</td><td>${powerAvg}</td></tr>`;
    });

    // Close the table
    tableHTML += '</table>';

    return tableHTML;
}
export function arrayToCSV(array) {
    return array.map(row => row.join(',')).join('\n');
}

export const pins = [
    {
        "name": "Default",
        "width": 38,
        "path": "path://m 4.2889181,49.689211 a 34.08205,34.08205 0 1 1 61.5862639,0 C 57.110412,68.161684 35.08205,76.142565 35.08205,100 35.08205,76.142565 13.053685,68.161684 4.2889181,49.689211 Z"
    },
    {
        "name": "Pin 1",
        "width": 18,
        "path": "path://M 12.751697,0.83556126 C 5.8974454,2.2341863 0.87466139,8.4724383 0.85321139,15.612847 c -0.0065,2.248032 0.44106201,4.096799 1.58688301,6.5537 3.457612,7.414888 12.3863826,10.508307 19.5890826,6.786404 1.86209,-0.962144 4.61757,-3.530441 5.78379,-5.390992 2.74422,-4.377166 3.01183,-9.98372 0.70476,-14.7531877 -1.11784,-2.310691 -4.21941,-5.468377 -6.47913,-6.596811 -2.83682,-1.41629904 -6.46029,-1.95320204 -9.2869,-1.37639904 m 1.43862,57.79956374 v 28.749901 l 0.63409,6.61112 c 0.34866,3.63633 0.6881,6.611124 0.75417,6.611124 0.0661,0 0.41636,-3.195314 0.77829,-7.100054 l 0.65798,-7.10004 -0.006,-28.260978 -0.006,-28.260968 h -1.40592 -1.40594 v 28.749895"
    },
    {
        "name": "Pin 2",
        "width": 29,
        "path": "path://M 15.298963,47.235388 20.341305,73.617696 25.383649,100 30.509816,73.762301 35.635986,47.524593 25.467475,47.37999 Z M 25.204816,0.00212874 C 11.44113,0.17914334 0.41111203,11.352735 0.53012071,24.998013 0.61742728,35.004154 6.6794448,43.572215 15.332494,47.410764 l -0.03354,-0.175376 10.168513,0.144602 10.013081,0.142334 C 44.337756,43.707705 50.529157,34.961176 50.529167,24.783642 l -0.0039,-0.428744 C 50.28715,10.711196 38.968462,-0.17489546 25.204816,0.00212874 Z M 25.886081,12.609005 c 5.811301,-0.07678 10.590284,4.646827 10.690855,10.567018 l 0.0017,0.186046 c 10e-6,5.921079 -4.698017,10.728263 -10.509751,10.753939 -5.811952,0.02567 -10.55077,-4.739957 -10.601036,-10.660917 -0.05024,-5.920905 4.606898,-10.7693 10.418243,-10.846086 z"
    },
    {
        "name": "Pin 3",
        "width": 21,
        "path": "path://M 19.439745,1.0510474 A 17.118715,17.118757 0 0 0 14.205559,34.784261 V 93.400698 L 18.122981,100 22.042334,93.400698 V 34.784261 A 17.176465,17.176508 0 0 0 35.242843,18.118746 17.118715,17.118757 0 0 0 19.439745,1.0510474 Z m 5.292191,7.4964845 a 4.3312411,4.3312519 0 0 1 2.6722,4.0025081 4.3312411,4.3312519 0 0 1 -4.331206,4.331216 4.3312411,4.3312519 0 1 1 1.659006,-8.3337241 z"
    },
    {
        "name": "Pin 4",
        "width": 27,
        "path": "path://M 24.099609,1 C 11.361622,1 1,11.361622 1,24.099609 1,35.616598 9.5004392,45.121892 20.548828,46.837891 V 100 h 6.599609 V 46.890625 C 38.434426,45.385827 47.199219,35.788198 47.199219,24.099609 47.199219,11.361622 36.837597,1 24.099609,1 Z m 0,6.5996094 c 9.101391,0 16.5,7.3986086 16.5,16.4999996 0,9.101391 -7.398609,16.5 -16.5,16.5 -9.101391,0 -16.4999996,-7.398609 -16.4999996,-16.5 0,-9.101391 7.3986086,-16.4999996 16.4999996,-16.4999996 z m -3.298828,6.5996096 v 6.601562 c 3.643197,0 6.59961,2.956413 6.59961,6.59961 H 34 C 34,20.120598 28.080574,14.199219 20.800781,14.199219 Z"
    },
    {
        "name": "Pin 5",
        "width": 28,
        "path": "path://M 25.750499,1.0005 C 12.101175,1.0005 1.0005,12.101175 1.0005,25.750499 c 0,12.238607 8.9390029,22.403011 20.625,24.378907 v 45.74414 c 0,2.276948 1.84399,4.125 4.124999,4.125 2.281011,0 4.125001,-1.848052 4.125001,-4.125 V 50.129406 C 41.561496,48.15351 50.5005,37.989106 50.5005,25.750499 50.5005,12.101175 39.399824,1.0005 25.750499,1.0005 Z m -4.124999,16.5 c 2.276951,0 4.124999,1.84805 4.124999,4.125 0,2.276951 -1.848048,4.124999 -4.124999,4.124999 -2.27695,0 -4.125,-1.848048 -4.125,-4.124999 0,-2.27695 1.84805,-4.125 4.125,-4.125 z"
    },
    {
        "name": "Pin 6",
        "width": 25,
        "path": "path://M 25.177123,100.23616 V 48.673663 M 9.6818094,25.236162 C 9.6818094,16.67835 16.61931,9.74085 25.177123,9.74085 m 23.4375,15.495312 A 23.437501,23.437501 0 0 1 25.177123,48.673663 23.437501,23.437501 0 0 1 1.7396217,25.236162 23.437501,23.437501 0 0 1 25.177123,1.7986623 23.437501,23.437501 0 0 1 48.614623,25.236162 Z"
    },
    {
        "name": "Pin star",
        "width": 28,
        "path": "path://m 24.162109,41.076172 v 57.644531 h 3.453125 V 41.076172 Z M 25.382812,1 20.107422,17.412109 c -0.533564,1.660866 -2.073347,2.783203 -3.81836,2.783203 H 1 l 12.058594,9.283204 c 1.36,1.046914 1.90111,2.843937 1.351562,4.464843 L 8.6347656,51 23.361328,41.857422 c 0.25403,-0.158077 0.524422,-0.275308 0.800781,-0.371094 v -0.410156 h 3.453125 v 0.800781 L 42.123047,51 36.53125,33.902344 c -0.525572,-1.604453 0.01033,-3.36505 1.337891,-4.408203 L 49.771484,20.195312 H 34.664062 c -1.724329,-4.69e-4 -3.257092,-1.103489 -3.80664,-2.74414 z"
    },
    {
        "name": "Sauce",
        "width": 15,
        "path": "path://M 15.335421,1.002099 C 13.803939,1.0214257 9.9633223,0.90773868 8.4557313,1.0213745 3.4678785,1.195535 1.2948353,1.8769666 0.82825569,6.4034526 0.38057869,20.032206 1.1820337,34.695025 1.0592017,48.308942 c -0.33750315,3.743549 1.7036814,6.936668 3.8463405,9.85825 2.1021203,2.844992 2.1264854,8.472201 2.2725291,11.96265 0.9813541,9.627759 0.7407341,17.731444 0.6703664,27.414895 0.3921534,1.743697 1.9483798,2.046212 3.3618893,2.314222 3.114352,0.243161 9.004605,0.718501 8.912382,-4.020276 -0.19928,-8.486097 -0.0036,-16.978147 0.476035,-25.452116 0.485081,-3.950463 -0.24685,-8.42846 2.068462,-11.821068 2.131948,-2.602281 3.533396,-5.838021 3.324408,-9.388011 C 26.142148,34.499001 26.03124,19.354083 25.955316,4.6745247 24.119801,0.79750411 19.093621,1.0199808 15.335421,1.002099 Z M 14.39944,6.7630946 c 0.751387,0.010383 1.501403,0.045852 2.245397,0.09546 7.17822,0.8680807 8.27592,6.9160654 7.855639,13.4246094 -0.19157,1.109326 0.617664,2.868377 -0.835121,3.15865 -2.001622,0.621318 -6.365615,4.510455 -1.721545,4.11654 3.521001,-0.841756 1.295543,2.883303 -0.509075,3.455377 -2.5001,2.528498 2.39635,0.20024 3.189641,-1.274839 -0.09353,3.819949 0.226097,7.703429 -0.525592,11.462738 -0.470094,-0.565254 -0.0057,1.591142 -0.360829,2.247309 -4.285638,0.543572 -8.641598,0.0444 -12.955065,0.204557 C 7.8165726,43.192493 4.9582583,44.535389 2.400979,43.76605 2.2211605,34.275317 2.0880651,25.236821 2.7133627,15.769734 2.3712961,12.01075 4.1553754,7.8868624 7.8092813,7.176607 9.9645502,6.4608808 12.145279,6.7319528 14.39944,6.7630946 Z M 24.449178,24.451831 c 1.705908,1.942564 -3.883956,2.596307 -3.187031,1.696652 0.984626,-0.723107 2.101068,-1.186933 3.187031,-1.696652 z m -5.446779,0.202676 c -0.356378,-0.111255 -0.91834,1.362006 -0.948153,1.797754 -1.35739,3.619838 -1.836098,-2.857683 -2.586231,-0.578403 1.145662,1.631189 -0.778729,4.873699 -0.708616,1.470933 -1.008888,-3.758288 -3.612565,3.59608 -3.21529,-1.035486 -1.213778,-1.418492 -0.348759,4.022306 -0.354308,5.049982 0.387818,4.696269 1.301946,-1.052788 1.553738,-2.748122 1.816187,-4.877399 0.923749,6.767444 2.027164,2.786683 0.708237,-3.591168 2.228799,-0.382677 2.617532,1.490685 1.819759,-0.543991 1.317198,-5.286054 1.874569,-7.497151 -0.04584,-0.486303 -0.141613,-0.699789 -0.260405,-0.736875 z M 9.3095767,27.67964 c -0.9993626,0.09669 -1.9540564,2.117374 -2.3875564,2.862866 -1.1675193,2.273517 0.6174073,1.927559 0.9498931,-0.05267 2.4167776,-4.641785 2.5336746,4.682765 -0.015644,4.773003 2.6590136,1.554537 3.1882396,-5.364306 2.1467146,-7.303406 C 9.7734919,27.73755 9.5402052,27.657323 9.3095821,27.679637 Z m 8.1177833,0.603796 c 1.006329,0.709679 -0.09716,3.651255 -0.267362,0.909459 l 0.03564,-0.585928 z M 5.3378502,30.00313 c -1.219258,-0.201777 -4.1684524,5.035963 -1.9958623,3.431391 0.7276798,-2.448147 2.4612292,-1.492089 0.9964103,0.476361 -1.5464912,1.972917 0.08601,1.766395 0.6447094,0.07899 1.7621657,-0.305236 -1.8925583,4.265067 -0.5894989,3.869663 2.9112903,-0.664867 1.8670924,-3.032937 1.4985267,-5.566312 L 5.8047585,31.721879 C 5.8849642,30.54284 5.6792466,30.059629 5.337854,30.003131 Z"
    }
];

export function showPinList() {
    const pinList = document.getElementById("pinList")
    pinList.innerHTML = "";
    const pinName = document.getElementById("pinName")    
    let selectedPin = null
    let settingsPin = common.settingsStore.get("pinName")
    let fillColor = common.settingsStore.get("pinColor")    
    pins.forEach(pin => {
        const pinDiv = document.createElement("div");
        let pinPath = pin.path.replace("path://","")
        pinDiv.classList.add("pin") 
        let pinOffset = -(50 - pin.width); // because I don't know really what I'm doing with vector paths, this sort of centers it
        pinDiv.innerHTML = `<svg class="pin-path" viewBox="${pinOffset} 0 100 100"><path d="${pinPath}" fill="${fillColor}" stroke="black" stroke-width="2" /></svg>`
        pinDiv.addEventListener("click", () => {
            const allPins = pinList.querySelectorAll(".pin");            
            allPins.forEach(pin => {
                pin.classList.remove("selected");
            });
            selectedPin = null;
            pinDiv.classList.toggle("selected");
            selectedPin = pinDiv;
            pinName.value = pin.name;
            const event = new Event("input", {bubbles: true})
            pinName.dispatchEvent(event);
        })
        if (pin.name == settingsPin) {
            pinDiv.classList.toggle("selected")
        }
        pinList.appendChild(pinDiv);
    })  
      
}

export function buildSegmentsTable(data, segmentSettings) {                
    let table = document.createElement('table');
    table.className = "segmentTable";
    table.id = "segmentTable";
    let headerRow = table.insertRow();
    let headers = Object.keys(data[0]);
    headers.splice(headers.indexOf("displayName"))
    headers.unshift("Show")    
    headers.forEach(function(header) {
        let th = document.createElement('th');
        th.textContent = header;
        if (header != "displayName") {
            headerRow.appendChild(th);
        }
        if (header == "id") {
                th.hidden = true;  // hide the id column but we want the data in the table
        }
    });
    headers.shift();    
    data.forEach(function(obj) {
        let row = table.insertRow();        
        let checkboxCell = row.insertCell();
        let checkbox = document.createElement('input');
        checkbox.type = "checkbox";        
        let segmentMatch;
         if (typeof(segmentSettings) != "undefined" && segmentSettings != null) {            
            segmentMatch = segmentSettings.find(x => x.repeat == obj.repeat && x.id == obj.id)
         }
        checkbox.checked = segmentMatch ? segmentMatch.Include : true;
        checkbox.onclick = function() {            
            returnData();
        };
        checkboxCell.appendChild(checkbox);
        headers.forEach(function(header) {
            let cell = row.insertCell();
            if (header == "Name") {  
                let segmentName = obj["displayName"] ?? obj["Name"]                
                cell.innerHTML = '<input type="text" size="40" value="' + segmentName + '">'
                let inputText = cell.querySelector('input[type="text"]');
                inputText.addEventListener('keydown', function(event) {
                    if (event.keyCode === 13) {
                        returnData();
                    }
                });
                inputText.addEventListener('blur', function() {
                    returnData();
                })
            } else {
                cell.textContent = obj[header];
            }
            if (header == "id") {
                cell.hidden = true;  // hide the id column but we want the data in the table
            }
        });        
    });

    return table;
}
function returnData() {
    let segmentArray = [];
    let table = document.getElementById("segmentTable");    
    for (let i = 1; i < table.rows.length; i++) {
        let row = table.rows[i];
        let segmentObject = {};
        for (let j = 0; j < row.cells.length; j++) {
            let cell = row.cells[j];
            if (j === 0) {                
                segmentObject['Include'] = cell.querySelector('input[type="checkbox"]').checked;
            } else if (j === 1) {
                segmentObject['displayName'] = cell.querySelector('input[type="text"]').value
            } else {                
                let header = table.rows[0].cells[j].textContent;
                let content = cell.textContent;
                segmentObject[header] = content;
            }
        }
        segmentArray.push(segmentObject);
    }        
    let jsonReturn = JSON.stringify(segmentArray)
    common.settingsStore.set("editedSegments", jsonReturn)    
}
export function selectObject(obj, ...properties) {
    if (!obj || typeof obj !== 'object') {
      throw new TypeError('Input must be an object');
    }
  
    const selectedObject = {};
  
    for (const prop of properties) {
      // Handle nested properties using recursion
      if (prop.includes('.')) {
        const [parentProp, childProp] = prop.split('.');
        selectedObject[parentProp] = selectObject(obj[parentProp] || {}, childProp);
      } else {
        // Handle direct properties
        if (Object.hasOwnProperty.call(obj, prop)) {
          selectedObject[prop] = obj[prop];
        }
      }
    }
  
    return selectedObject;
}

export function convertWorkoutData(data) {
    const lines = data.split("\n"); // Split the data by line breaks
    const workout = {};
    let workoutDetails = data.substring(data.indexOf('<workout>') + 9, data.indexOf('</workout>'))
    let warmupStart = workoutDetails.indexOf('<Warmup')
    let warmupEnd = workoutDetails.indexOf('</Warmup>') + 9
    let warmup = workoutDetails.substring(warmupStart, warmupEnd)
    let cooldownStart = workoutDetails.indexOf('<Cooldown')
    let cooldownEnd = workoutDetails.indexOf('</Cooldown>') + 11
    let cooldown = workoutDetails.substring(cooldownStart, cooldownEnd)
    let workoutBody = workoutDetails.substring(warmupEnd + 1, cooldownStart - 9)
    //console.log(workoutBody)
    workout.warmup = parseWorkoutLineToObject(warmup);
    workout.body = parseWorkoutBody(workoutBody);
    workout.cooldown = parseWorkoutLineToObject(cooldown);
  
    return workout;
  }
  
  
export function xmlToKeyValuePair(xmlString) {
    // Remove the opening and closing tags
    const content = xmlString.substring(xmlString.indexOf('>') + 1, xmlString.lastIndexOf('<'));

    // Split the content into key and value
    const keyValue = xmlString.substring(xmlString.indexOf('<') + 1, xmlString.indexOf('>'))

    // Trim any extra spaces
    const key = keyValue.trim();
    const value = content.trim();

    return { [key]: value };
}

function parseWorkoutLineToObject(xmlString, offset) {
    //console.log(xmlString)
    let offsetMarker = offset || 0
    const content = xmlString.substring(xmlString.indexOf('<') + 1 + offsetMarker, xmlString.indexOf('>') - 1 + offsetMarker).trim();
    const contentSplit = content.split(" ")    
    const obj = {};
    obj.name = contentSplit[0];
    for (let i = 1; i < contentSplit.length; i++) {        
        const [prop, value] = contentSplit[i].split('=')        
        obj[prop.trim()] = value.replace(/"/g, '');
    }
    return obj;
}

function parseWorkoutBody(body) {    
    let bodyDetails = []
    const lines = body.split("\n");
    for (let line of lines) {
        if (line.indexOf('textevent') == -1 && line.indexOf('</') == -1 && line != "") {
            //console.log(line)
            let parsedLine = parseWorkoutLineToObject(line)
            bodyDetails.push(parsedLine)
        }
    }
    return bodyDetails
}