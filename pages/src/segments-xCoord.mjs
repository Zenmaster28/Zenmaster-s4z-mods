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


export async function getModifiedRoute(id) {                   
        let route = await common.rpc.getRoute(id);
        if (!route) {
            console.log("Route not found in Sauce, checking json")
            let newRoutes = await fetch("data/routes.json").then((response) => response.json()); 
            route = newRoutes.find(x => x.id == id)
            route.courseId = common.worldToCourseIds[route.worldId]
            //debugger
        }
        let missing = missingLeadinRoutes.filter(x => x.id == id)        
        let replacementLeadin;
        let leadin;        
        if (missing.length > 0) {
            //replacementLeadin = await common.rpc.getRoute(missing[0].replacement)
            //leadin = replacementLeadin.manifest.filter(x => x.leadin);
            leadin = missing[0].leadin;
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
    }
];

export function showPinList() {
    const pinList = document.getElementById("pinList")
    const pinName = document.getElementById("pinName")
    let selectedPin = null
    let settingsPin = common.settingsStore.get("pinName")
    pins.forEach(pin => {
        const pinDiv = document.createElement("div");
        let pinPath = pin.path.replace("path://","")
        pinDiv.classList.add("pin") 
        let pinOffset = -(50 - pin.width); // because I don't know really what I'm doing with vector paths, this sort of centers it
        pinDiv.innerHTML = '<svg class="pin-path" viewBox="' + pinOffset + ' 0 100 100"><path d="' + pinPath + '" fill="red" stroke="black" stroke-width="2" /></svg>'
        pinDiv.addEventListener("click", () => {
            const allPins = pinList.querySelectorAll(".pin");
            //debugger
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
