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
//let missingLeadinRoutes = await fetch("data/missingLeadinRoutes.json").then((response) => response.json()); 
//let replacementLeadins = await fetch("data/leadinData.json").then((response) => response.json());

export async function processRoute(courseId, routeId, laps, distance, includeLoops, showAllArches, disablePenRouting) { 
    distance = parseInt(distance);
    curvePathIndex = 0;   
    routeSegments.length = 0;
    allMarkLines.length = 0;   
    //routeFullData = await common.getRoute(routeId);
    if (includeLoops) {

    } else {
        includeLoops = false;
    }        
    routeFullData = await getModifiedRoute(routeId, disablePenRouting); 
    worldSegments = await common.rpc.getSegments(courseId);
    zwiftSegmentsRequireStartEnd = await fetch("data/segRequireStartEnd.json").then((response) => response.json());
    if (showAllArches) {
        //console.log("Showing all arches - processRoute")
    } else {
        //console.log("Not showing all arches - processRoute")
        showAllArches = false
    }
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
        //debugger      
        if (routeFullData.lapFiller.curvePath?.nodes?.length > 0) {
            routeFullData.curvePath.extend(routeFullData.lapFiller.curvePath)
            for (let i = 0; i < routeFullData.lapFiller.distances.length; i++) {
                distances.push(distances.at(-1) + (routeFullData.lapFiller.distances[i] - (routeFullData.lapFiller.distances[i - 1] || 0)));
                elevations.push(routeFullData.lapFiller.elevations[i]);
                grades.push(routeFullData.lapFiller.grades[i]);
            }
            for (let j = 0; j < routeFullData.lapFiller.roadSegments.length; j++) {  
                let roadSegmentClone = Object.assign(Object.create(Object.getPrototypeOf(routeFullData.lapFiller.roadSegments[j])), routeFullData.lapFiller.roadSegments[j])  
                roadSegmentClone.lap = lap + 1;        
                roadSegments.push(roadSegmentClone);            
                //roadSegments[roadSegments.length - 1].lap = lap + 1;
            }  
        }
        const lapFillerCurvePathLength = routeFullData.lapFiller.curvePath?.nodes?.length || 0;
        //routeFullData.curvePath.extend(routeFullData.curvePath.slice(lapStartIdx, routeFullData.curvePath.nodes.length - routeFullData.lapFiller.curvePath?.nodes?.length));
        routeFullData.curvePath.extend(routeFullData.curvePath.slice(lapStartIdx, routeFullData.curvePath.nodes.length - lapFillerCurvePathLength));
        //debugger
        //console.log("Lap ", lap, "curvePath", routeFullData.curvePath)
        for (let i = lapStartIdx; i < routeFullData.distances.length; i++) {
            //need to get lapFiller distances, elevations and grades
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
        let segments = findSegmentsOnRoadSection(roadSegment, curvePathIndex, rsIdx, showAllArches);
        //debugger
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
                        //don't include loops if not specified - unless showing all arches
                        if (showAllArches) {
                            segment.finishArchOnly = true;
                            segment.type = "custom";
                            routeSegments.push(segment);    
                        }
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
                    //debugger
                    if (showAllArches) {
                        segment.finishArchOnly = true;
                        segment.type = "custom";
                        routeSegments.push(segment);    
                    }
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
        //console.log(markLines)
        if (markLines)
        {
            
            for (let i = 0; i < markLines.length; i++) {
                if (markLines[i]) {
                    isNaN(markLines[i].markLine) ? "" : allMarkLines.push(markLines[i]);
                }
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
    const maxLaps = routeInfo.routeFullData.roadSegments.at(-1).lap
    let lapNodes = {};
    let minNodeCounter = 0;
    for (let lap = 1; lap <= maxLaps; lap++) {
        lapNodes[lap - 1] = lap == 1 ? 0 : minNodeCounter;
        const thisLap = routeInfo.routeFullData.roadSegments.filter(x => x.lap == lap);
        let nodeCounter = 0;
        for (let r of thisLap) {
            nodeCounter += r.nodes.length;
        }
        minNodeCounter += nodeCounter;
    }
    routeInfo.routeFullData.lapNodes = lapNodes;
    console.log(routeInfo)
    //debugger
    return routeInfo;
}

function findSegmentsOnRoadSection(thisRoad, cpIndex, rsIdx, showAllArches) {
    
    typeof thisRoad.reverse === 'undefined' ? thisRoad.reverse = false : "";
    typeof thisRoad.lap === 'undefined' ? thisRoad.lap = 1 : "";
    const segmentsOnRoad = worldSegments.filter(x => (x.roadId == thisRoad.roadId));
    let roadSegments = [];    
    if (segmentsOnRoad.length > 0) {
        // there are segments on this road, check if they match this roadSection
        //console.log("Found " + segmentsOnRoad.length + " possible segments on this road")
        for (let segment of segmentsOnRoad) {
            if (!segment.givesPowerUp && segment.worldId !== 8) {
                continue; // hide banners with no Powerup (hidden Pier_RouteStart)
            }
            if ((segment.roadStart == null || segment.reverse != thisRoad.reverse) && (!showAllArches)) {
                // skip segments with no roadStart value and the segment and road direction must match
                continue;
            }            
            segment.id == "1065262910" ? segment.id = "18245132094" : ""; // leg snapper segment id workaround
            let includeSegment = false;   
            let wrongWay = false;
            if (segment.reverse != thisRoad.reverse) {
                wrongWay = true;
                includeSegment = false;
                //console.log("We are going the wrong way for this segment")
            }         
            let foundSegmentStart = wrongWay ? false : thisRoad.includesRoadPercent(segment.roadStart);  // does the roadSection go through the start of the segment
            let foundSegmentEnd = thisRoad.includesRoadPercent(segment.roadFinish); // does the roadSection go through the end of the segment
            //debugger
            // let showAllArches = true;
            if (zwiftSegmentsRequireStartEnd.includes(segment.id)) {
                if (foundSegmentStart && foundSegmentEnd) {
                    // segment is flagged as requiring the roadSection to go through both the start and end of segment and it does!                    
                    includeSegment = true;                            
                } 
            }
            else if (foundSegmentStart || foundSegmentEnd) {
                // segment only requires going through start or end and it does                
                includeSegment = wrongWay ? false : true;
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

            } else if (!includeSegment && showAllArches && foundSegmentEnd && !foundSegmentStart) {
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
                newSegment.finishArchOnly = true;
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
    //console.log(roadSegments)
    const filteredSegments = [];
    if (roadSegments.length > 0) {
        let groupedSegments = groupBy(roadSegments, 'roadFinish')
        for (let s in groupedSegments) {
            if (groupedSegments[s].length > 1) {
                filteredSegments.push(groupedSegments[s].find(x => x.reverse == thisRoad.reverse))
            } else {
                filteredSegments.push(groupedSegments[s][0])
            }
        }
    }
    if (roadSegments.length > 0) {
        //debugger
    }
    return filteredSegments
    //return roadSegments;
}

export const groupBy = (array, key) => {
    return array.reduce((result, currentValue) => {
        // Get the value of the key we want to group by
        const groupKey = currentValue[key];

        // If the key is not already in the result object, add it
        if (!result[groupKey]) {
            result[groupKey] = [];
        }

        // Add the current object to the group
        result[groupKey].push(currentValue);

        // Return the result object for the next iteration
        return result;
    }, {});
};

function getSegmentMarkline(segment) {
    const distances = Array.from(routeFullData.distances);
    let percentOffset;
    let boundsLineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;        
    segment.reverse ? percentOffset = (1 - segment.bounds.percent) : percentOffset = segment.bounds.percent;
    let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
    let markLineIndex = distances[boundsLineIndex] + indexOffset                
    //allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})  // segment start lines
    const markLineStart = segment.finishArchOnly ? null : {
        name: segment.name, 
        markLine: markLineIndex, 
        id: segment.id, 
        archId: segment.archId,
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
    const markLineFinish = segment.finishArchOnly ? {
        name: segment.name + " Finish",
        markLine: markLineIndexFinish,
        id: segment.id,
        archId: segment.archId,
        finishArchOnly: true
    } : {
        name: segment.name + " Finish", 
        markLine: markLineIndexFinish, 
        id: segment.id, 
        archId: segment.archId,
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
    const sauceRoutes = await common.rpc.getRoutes();
    const zenRoutes = await fetch("data/routes.json").then((response) => response.json());
    const combinedRoutes = [...sauceRoutes, ...zenRoutes];
    const allRoutes = combinedRoutes.filter((obj, index, self) => index === self.findIndex((x) => x.id === obj.id));
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

async function findShortestExitPath(startRoad, startDirection, targetRoad, targetDirection, intersections, allRoads, route) {
    let maxDepth = 6 // if we make 6 or more total intersection decisions, we are lost
    let maxNonPaddockRoads = 4; // if we run into 4 or more roads that aren't paddock roads, we are lost
    let path = [];
    let allPaths = [];
    let found = false;
    function explore(roadId, forward, depth, currentPath, exitTime) { 
        if (!allRoads.find(x => x.id == roadId)) {
            //console.log("Found a roadId that Sauce doesn't know about, ignoring roadId", roadId)
            return
        }
        if (depth > maxDepth) {
            return;
        } 
        if (roadId === targetRoad && forward != targetDirection) {
            //we found the target road but going the wrong way, we are lost
            return;
        } 
        let nonPaddockRoads = 0;
        for (let road of currentPath) {
            if (!isPaddockRoad(road, intersections)) {
                //keep track of non paddock roads
                nonPaddockRoads++
            }
        }
        if (nonPaddockRoads > maxNonPaddockRoads) {
            //we exceeded the max number of non paddock roads, this isn't a valid path
            return;
        }
        let currentRP = 0
        if (exitTime == -1) {
            //this must be the initial starting point, set the roadTime to 0 for a forward road and 1 for a reverse road
            currentRP = forward ? 0 : 1
            exitTime = 0
            
        } else {
            //on the new road, find the nearest point to where we exited the last road
            const rd1 = allRoads.find(x => x.id == currentPath.at(-1).roadId)
            const rd2 = allRoads.find(x => x.id == roadId)                     
            currentRP = getNearestPoint(rd1, rd2, exitTime, 25000)            
        }
        // Add current road and direction to the path
        if (currentPath.some(pathEntry => pathEntry.roadId === roadId && pathEntry.forward === forward && pathEntry.exitTime === exitTime)) {
            //we've already been here, don't record it again
        } else {
            if (currentPath.length > 0) {
                currentPath.at(-1).exitTime = exitTime // set the exitTime for the previous entry
                currentPath.push({ roadId: roadId, forward: forward, exitTime: exitTime, entryTime: currentRP });
            } else {
                currentPath.push({ roadId: roadId, forward: forward, exitTime: exitTime, entryTime: currentRP });
            }
            if (roadId === targetRoad && forward === targetDirection) {
                //we found the target road in the right direction, add the current path as a valid path
                const validPath = JSON.parse(JSON.stringify(currentPath)) // not sure I need to do this but...
                allPaths.push(validPath)
                return;
            }
            
            // Look for intersections on the current road
            const currentIntersections = intersections.find(int => int.id === roadId);            
            if (currentIntersections.intersections) {            
                // Sort intersections by m_roadTime1 to ensure the decisions are made in sequence            
                currentIntersections.intersections.sort((a, b) => {
                    return a.m_roadTime1 > b.m_roadTime1;
                })
                let validIntersections = []; // filter only the intersections that are after our current roadPercent
                if (forward) {
                    validIntersections = currentIntersections.intersections.filter(x => x.m_roadTime2 > currentRP)
                } else {
                    validIntersections = currentIntersections.intersections.filter(x => x.m_roadTime1 < currentRP)
                }
                for (const intersection of validIntersections) {
                    // recursively look at intersection options in the direction we are going
                    if (forward) {
                        for (const option of intersection.forward) {
                            if (option.option) {                    
                                explore(option.option.road, option.option.forward, depth + 1, [...currentPath], option.option.exitTime);
                            }
                        }
                    } else {
                        for (const option of intersection.reverse) {
                            if (option.option) {            
                                explore(option.option.road, option.option.forward, depth + 1, [...currentPath], option.option.exitTime);
                            }
                        }
                    }
                }
            }
        }
    } 
    
    if (route.courseId == 13 && (startRoad == 75 || startRoad == 81)) {
        //sure Zwift, just make **almost** all of the pen roads forward, except for a few...
        startDirection = false
    }
    
    // Start exploring from the initial road and direction
    explore(startRoad, startDirection, 0, [], -1);

    
    let shortestDistance = Infinity;
    const worldList = await common.getWorldList();
    const worldMeta = worldList.find(x => x.courseId === route.courseId); 
    for (let exitPath of allPaths) {
        //of all the possible exit paths we found, measure the length of the road and pick the shortest one
        const exitPathDistance = await getExitPathDistance(exitPath, route, worldMeta)
        if (exitPathDistance.exitDistance < shortestDistance) {
            shortestDistance = exitPathDistance.exitDistance
            path = exitPathDistance.exitManifest
        }
    }
    
    if (path) {
        found = true
        path.forEach(road => {
            road.paddockExitRoadTime = isPenExitRoad(road, intersections)
            road.isPaddockRoad = isPaddockRoad(road, intersections)
            road.isTargetRoad = isTargetRoad(road, targetRoad, targetDirection)
        })
    }
    return found ? path : null; // Return the path if found, otherwise null
  }

async function getExitPathDistance(exitPath, route, worldMeta) {
    let exitRoute = JSON.parse(JSON.stringify(route))
    exitRoute.curvePath = new curves.CurvePath();
    exitRoute.roadSegments = []; 
    let manifest = []
    for (let road of exitPath) {
        let skipRoad = false;
        if (road.roadId == route.manifest[0].roadId) { // fix the target road manifest entry        
            if (road.forward) {
                if (route.courseId == 6 && road.roadId == 0 && (route.manifest[0].end == 1 || route.manifest[1].end == 1)) {
                    // downtown Watopia leaving the pens left.  If the first manifest on the Zwift route end at 1, remove it to align things properly 
                    //console.log("Fixing downtown Watopia pen exit...")                    
                    route.manifest.shift();
                    if (route.manifest[0].end == 1 && route.manifest[0].roadId == 0) {
                        // some routes like downtown titans have two entries at the start of the route that need to go away
                        route.manifest.shift()
                    }
                    //debugger
                    if (route.manifest.length > 1 && route.manifest[1].end == 1 && route.manifest[0].roadId == 0) {
                        //Three little sisters has WTF route data...
                        route.manifest.splice(1, 1)
                    }
                    //debugger
                    route.manifest[0].start = road.entryTime; // align the route with the pen ramp exit
                    skipRoad = true;
                    let lastManifestEntry = route.manifest.at(-1)
                    if (lastManifestEntry.roadId == 0 && !lastManifestEntry.reverse && lastManifestEntry.end < 0.9828947442) {
                        //move the end of the route to the banner for completeness
                        lastManifestEntry.end = 0.9828947443
                    }
                } else if (road.entryTime > route.manifest[0].start && road.entryTime > route.manifest[0].end) {
                    //the road time has a 0/1 barrier between it and the first manifest entry, create a new manifest entry to span it
                    manifest.push({
                        end: 1,
                        start: road.entryTime,
                        reverse: false,
                        roadId: road.roadId,
                        leadin: true
                    },
                    {
                        end: route.manifest[0].start,
                        start: 0,
                        reverse: false,
                        roadId: road.roadId,
                        leadin: true
                    })
                    break
                } else if (road.entryTime > route.manifest[0].start && road.entryTime < route.manifest[0].end) {
                    // we entered the target road inside of the route manifest entry, push the route manifest entry up.
                    if (route.id == 2007026433) { // also ignore 2019 Worlds Harrogate because this logic fails, it's the only one and I can't be bothered to fix it since it still works well
                        skipRoad = true
                    } else if (route.manifest[0].start < road.entryTime) {
                        //the Zwift manifest is a behind where we calculated we entered the road, move the Zwift manifest up and then skip this road in the manifest as things are aligned
                        route.manifest[0].start = road.entryTime
                        skipRoad = true;
                    } else {
                        //move the exitTime for this road up to the start of the Zwift route
                        road.exitTime = route.manifest[0].start
                    }
                } else {
                    //align the exit time for this road to the start of the Zwift route
                    road.exitTime = route.manifest[0].start
                }
            } else {
                // note, I don't deal with a case of crossing a 0/1 barrier in reverse as I don't think any routes do that but it could happen in the future
                if (road.entryTime > route.manifest[0].start && road.entryTime < route.manifest[0].end) {
                    // we entered the target road inside of the route manifest entry, push the route manifest entry up.
                    route.manifest[0].end = road.entryTime
                    skipRoad = true;
                } else {
                    road.exitTime = route.manifest[0].end
                }
            }
        }

        if (!skipRoad && ((road.forward && road.entryTime < road.exitTime) || (!road.forward && road.exitTime < road.entryTime))) { // make sure we have a valid manifest entry and aren't skipping this road
            // add the road entry and exit details to the manifest for processing
            manifest.push({
                end: road.forward ? road.exitTime : road.entryTime,
                start: road.forward ? road.entryTime : road.exitTime,
                reverse: road.forward ? false : true,
                roadId: road.roadId,
                leadin: true
            })
        }
    }

    for (const [i, x] of manifest.entries()) {
        // road building magic borrowed from Sauce
        const road = await common.getRoad(exitRoute.courseId, x.roadId);
        const seg = road.curvePath.subpathAtRoadPercents(x.start, x.end);
        seg.reverse = x.reverse;
        seg.leadin = x.leadin;
        seg.roadId = x.roadId;
        for (const xx of seg.nodes) {
            xx.index = i;
        }
        exitRoute.roadSegments.push(seg);
        exitRoute.curvePath.extend(x.reverse ? seg.toReversed() : seg);
    }
    const supPath = common.supplimentPath || supplimentPath;
    Object.assign(exitRoute, supPath(worldMeta, exitRoute.curvePath));
    if (exitRoute.distances.length > 0) {
        return {
            exitDistance: exitRoute.distances.at(-1),
            exitManifest: manifest
        }
    } else {
        return {
            exitDistance: Infinity,
            exitManifest: manifest
        }
    }    
}

async function measureRoadLength(manifestEntry, courseId) {
    let tempCurvepath = new curves.CurvePath()
    const road = await common.getRoad(courseId, manifestEntry.roadId)
    const seg = road.curvePath.subpathAtRoadPercents(manifestEntry.start, manifestEntry.end)
    seg.reverse = manifestEntry.reverse ? manifestEntry.reverse : false
    seg.roadId = manifestEntry.roadId
    tempCurvepath.extend(seg)
    const worldList = await common.getWorldList();
    const worldMeta = worldList.find(x => x.courseId === courseId);
    const supPath = common.supplimentPath || supplimentPath;
    const manifestData = supPath(worldMeta, seg);
    return manifestData.distances.at(-1);
}

function isTargetRoad(road, targetRoad, targetDirection) {
    if (road.roadId == targetRoad && road.reverse != targetDirection) {
        return true;
    } else {
        return false;
    }
}
function isPaddockRoad(road, intersections) {
    const roadData = intersections.find(x => x.id == road.roadId)
    if (roadData.roadIsPaddock) {
        return true;
    } else {
        return false;
    }
}

function isPenExitRoad(road, intersections) {
    const roadData = intersections.find(x => x.id == road.roadId)
    if (roadData.paddockExitRoadTime) {
        return roadData.paddockExitRoadTime;
    } else {
        return false;
    }
}

async function getPenExitRoute(route) {
    const paddocksData = await fetch("data/paddocks.json").then(response => response.json())
    const worldPaddocks = paddocksData.find(x => x.worldId == route.worldId)
    if (!route.eventPaddocks) {
        // the route doesn't have eventPaddocks listed so go find another route that has the same starting road and use the paddocks data from it
        const sauceRoutes = await common.rpc.getRoutes(route.courseId);
        const sameStartRoad = sauceRoutes.find(x => x.eventPaddocks && x.manifest[0].roadId == route.manifest[0].roadId)
        if (sameStartRoad) {
            route.eventPaddocks = sameStartRoad.eventPaddocks
        }
    }
    if (route.eventPaddocks) { // if no eventPaddocks, just use the route data from Zwift and forget the pens
        const routePaddocks = route.eventPaddocks.toString().split(",").map(Number)
        const paddockRoads = routePaddocks.map(key => worldPaddocks?.paddockRoads[key]);        
        const intersections = await fetch(`data/worlds/${route.worldId}/roadIntersections.json`).then(response => response.json());
        const allRoads = await common.getRoads(route.courseId)
        const iRoads = paddockRoads.map(r => intersections.find(x => x.id == r)).filter(x => x != undefined)
        //const exitRoads = iRoads.filter(x => x != undefined && x.paddockExitRoadTime)
        const targetRoad = {
            roadId: route.manifest[0].roadId,
            forward: route.manifest[0].reverse ? false : true
        }
        let startRoad;
        //let possiblePaths = [];
        startRoad = iRoads.filter(x => !x.paddockExitRoadTime)[0] || iRoads[0] // don't start with an exit road unless it's the only one, possible odd results.
        if (!startRoad) {
            return [];
        }
        let exitPath = findShortestExitPath(startRoad.id, true, targetRoad.roadId, targetRoad.forward, intersections, allRoads, route)
        if (exitPath) {
            return exitPath;
        } else {
            return [];
        }
    } else {
        //console.log("Route has no paddocks info!")
        return [];
    }
}

export async function getModifiedRoute(id, disablePenRouting) {                   
        let route = await common.rpc.getRoute(id);        
        if (!route) {
            //console.log("Route not found in Sauce, checking json")
            let newRoutes = await fetch("data/routes.json").then((response) => response.json()); 
            route = newRoutes.find(x => x.id == id)
            if (!route) {
                //console.log("No matching route found, switching to road view")
                return -1
            } else {
                //console.log("Found route", route.name, "in json")
                route.courseId = common.worldToCourseIds[route.worldId]
            }
            //debugger
        }
        let missing = [];
        let replacementLeadin =[];
        let penExitRoute = [];  
        if (!disablePenRouting) {
            penExitRoute = await getPenExitRoute(route)        
            //console.log("Pen exit path", penExitRoute)
        }

        if (penExitRoute.length > 0) {
            const exitRoads = penExitRoute.filter(x => x.paddockExitRoadTime)
            if (exitRoads.length > 0) {
                //found an exit road on the path, start the manifest there
                const lastExitRoad = exitRoads.at(-1)
                const idxExitRoad = penExitRoute.findIndex(road => road === lastExitRoad)
                const manifest = penExitRoute.slice(idxExitRoad - 1)
                let routeStarted = false;
                for (let rd of manifest) {
                    if (rd.isPaddockRoad && rd.paddockExitRoadTime) {
                        routeStarted = true
                        continue;
                    }
                    if (routeStarted && rd.isPaddockRoad) {
                        //the route started but we hit a paddockRoad, eventDistance will not be used on this road so get it's distance to offset the route
                        const rdLength = await measureRoadLength(rd, route.courseId)
                        route.paddockExitOffset = parseInt(rdLength.toFixed(0))
                        console.log("Adding a paddockExitOffset of ", route.paddockExitOffset, "to the route ")
                        //debugger
                    }
                }
                missing.push({leadin: []});
                for (let i = 1; i < manifest.length; i++) {
                    missing[0].leadin.push({
                        end: manifest[i].end,
                        leadin: true,
                        roadId: manifest[i].roadId,
                        start: manifest[i].paddockExitRoadTime ? manifest[i].paddockExitRoadTime : manifest[i].start,
                        reverse: manifest[i].reverse
                    })
                }   
                //debugger             
            } else {
                // the pens have no exit point defined.  Instead we get the point on the first non paddock road and that's where the magic line is.
                const firstNonPaddockRoad = penExitRoute.find(x => !x.isPaddockRoad)
                const idxFirstNonPaddockRoad = penExitRoute.findIndex(road => road === firstNonPaddockRoad)
                const manifest = penExitRoute.slice(idxFirstNonPaddockRoad - 1)
                missing.push({leadin: []});
                for (let i = 1; i < manifest.length; i++) {
                    
                    missing[0].leadin.push({
                        end: manifest[i].end,
                        leadin: true,
                        roadId: manifest[i].roadId,
                        start: manifest[i].start,
                        reverse: manifest[i].reverse
                    })
                }
            }
            
        } else {
            console.log("No pen exit route found!")            
            missing = []; //bypass the missing leadins for routes where the pen exit couldn't be found 
        }
        let leadin = [];        
        if (missing.length > 0 || typeof(penExit) != "undefined") {            
            if (typeof(penExit) != "undefined") {
                if (penExit.paddockExitData.roadId == route.manifest[0].roadId && penExit.paddockExitData.reverse == (route.manifest[0].reverse ?? false)) {
                    if (penExit.paddockExitRoad[0].roadId == route.manifest[0].roadId) {
                        // remove the first entry in the manifest to account for the odd time that the exit road is in the manifest (Handful of Gravel)
                        route.manifest.shift()
                    }
                    leadin = penExit.paddockExitRoad
                    if (!penExit.replace) {
                        if (penExit.paddockExitData.reverse) {
                            if (penExit.paddockExitData.roadTime > route.manifest[0].start) {
                                route.manifest[0].end = penExit.paddockExitData.roadTime
                            }
                        } else {
                            if (penExit.paddockExitData.roadTime < route.manifest[0].end) {
                                route.manifest[0].start = penExit.paddockExitData.roadTime
                            }
                        }
                    } else {
                        route.manifest = route.manifest.filter(x => !x.leadin) // we are replacing the leadin so remove the existing one
                    }
                }
            } else if (missing.length > 0) {
                leadin = missing[0].leadin;
            }
        }        
        for (let i = leadin.length; i > 0; i--) {
            route.manifest.unshift(leadin[i - 1]);
        }
            if (route) {
                //let lastManifestEntry = route.manifest.at(-1);                
                if (route.courseId == 14 && !disablePenRouting) { // France
                    if (route.id == 986252325) {  // Douce France needs extra manifest entries after the finish to allow for multiple laps
                        route.extraManifest = [{
                            end: 0.49016710144219455,
                            roadId: 26,
                            start: 0.4821480325
                        },
                        {
                            end: 0.778745099242397,
                            roadId: 1,
                            start: 0.24767863682868888
                        },
                        {
                            end: 0.03494393677166804,
                            roadId: 0,
                            start: 0.018091671029747677
                        }];

                        /*
                        debugger
                        route.extraManifest = [];
                        do {
                            // put the extra manifest entries aside for later use if more than one lap
                            route.extraManifest.unshift(route.manifest.at(-1))
                            route.manifest.pop()
                        } while (route.manifest.at(-1).roadId != 26) //rewind the manifest to get back to the proper road for the Marina sprint
                        route.extraManifest.unshift({
                            end: route.manifest.at(-1).end,
                            roadId: route.manifest.at(-1).roadId,
                            start: 0.4821480324
                        })
                        route.manifest.at(-1).end = 0.4821480324
                        */
                    }
                    //debugger
                }
                if (route.courseId != 13 && !disablePenRouting) { // stupid fake neon banners in Makuri...
                    const lastManifestEntry = route.manifest.at(-1);
                    await isBannerNearby(lastManifestEntry, route.courseId, "last");
                    const leadin = route.manifest.filter(x => x.leadin)
                    if (leadin.length > 0 && route.id != 1433431343) {
                        const lastLeadin = leadin.at(-1)
                        await isBannerNearby(lastLeadin, route.courseId, "leadin")
                        const idxLastLeadin = route.manifest.indexOf(lastLeadin)
                        if (route.manifest[idxLastLeadin + 1].roadId == lastLeadin.roadId) {
                            lastLeadin.reverse ? route.manifest[idxLastLeadin + 1].end = lastLeadin.start : route.manifest[idxLastLeadin + 1].start = lastLeadin.end // align the leadin and route start
                        }
                    }
                } 
                route.curvePath = new curves.CurvePath();
                route.roadSegments = [];
                route.lapFiller = {}; 
                route.lapFiller.curvePath = []; 
                if (!disablePenRouting) {       
                    route.routeGaps = await validateManifest(route)               
                }
                //console.log(route.manifest)
                const worldList = await common.getWorldList();
                const worldMeta = worldList.find(x => x.courseId === route.courseId);
                //debugger
                for (const [i, x] of route.manifest.entries()) {
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
                const supPath = common.supplimentPath || supplimentPath;
                Object.assign(route, supPath(worldMeta, route.curvePath));
            }
                       
            return route;
        
}

export async function getSegmentPath(id) {
    let segment = await common.rpc.getSegment(id.toString())
    //console.log(segment)
    //debugger
    if (segment) {
        segment.curvePath = new curves.CurvePath();
        segment.roadSegments = []; 
        const worldList = await common.getWorldList();
        const worldMeta = worldList.find(x => x.worldId === segment.worldId);
        let i = 1;
        let loop = false;
        if (segment.name.toLowerCase().includes("loop") || segment.roadStart == segment.roadFinish) {
            i = 2;
            loop = true;
        }
        for (let r=0;r <i;r++) {
            let seg;      
            
            const road = await common.getRoad(common.worldToCourseIds[segment.worldId], segment.roadId);            
            if (segment.reverse) {
                //debugger
                if (loop && r == 0) {
                    //console.log("Reverse Looped segment and first pass")
                    seg = road.curvePath.subpathAtRoadPercents(segment.roadFinish, 1);
                } else if (loop && r == 1) {
                    //console.log("Reverse Looped segment and second pass")
                    seg = road.curvePath.subpathAtRoadPercents(0, segment.roadStart);
                } else if (!loop) {
                    seg = road.curvePath.subpathAtRoadPercents(segment.roadFinish, segment.roadStart);
                }
            } else {
                if (loop && r == 0) {
                    //console.log("Looped segment and first pass")
                    seg = road.curvePath.subpathAtRoadPercents(segment.roadStart, 1);                    
                } else if (loop && r == 1) {
                    //console.log("Looped segment and second pass")
                    seg = road.curvePath.subpathAtRoadPercents(0, segment.roadFinish);                    
                } else if (!loop) {
                    seg = road.curvePath.subpathAtRoadPercents(segment.roadStart, segment.roadFinish);
                }
            }
            seg.reverse = segment.reverse;
            //seg.leadin = segment.leadin;
            seg.roadId = segment.roadId;
            for (const xx of seg.nodes) {
                //xx.index = i;
            }
            //console.log(seg)
            segment.roadSegments.push(seg);
            segment.curvePath.extend(segment.reverse ? seg.toReversed() : seg);            
            
            // NOTE: No support for physicsSlopeScaleOverride of portal roads.
            // But I've not seen portal roads used in a route either.
            //debugger
        }
        const supPath = common.supplimentPath || supplimentPath;
        Object.assign(segment, supPath(worldMeta, segment.curvePath));
    }
    return segment;
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
            return i;
            //return arr[i];
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
        const sauceVersion = await common.rpc.getVersion()
        let modPath;
        if (sauceVersion.startsWith("1.1")) {
            modPath = o101Mod.modPath.split("\\").at(-1)
        } else {
            modPath = o101Mod.id
        }
        return modPath;
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
    //const localRouteInfo = localStorage.getItem("routeInfo")
    let routeInfo;
    let segmentData;
    //if (localRouteInfo) {
    //    routeInfo = JSON.parse(localRouteInfo);
    //} else {
        segmentData = (await common.rpc.getAthleteData("watching")).segmentData
        segmentData = segmentData.routeSegments.filter(x => x.type != "custom" && !x.name.includes("Finish"));
        console.log(segmentData)
        const segmentsTable = document.getElementById("segmentsTable")
        const tableData = buildPointsTable(segmentData)
        segmentsTable.appendChild(tableData)
    //}
    //debugger
    //const routeInfo = common.settingsStore.get("routeInfo")
    /*
    const segmentsForm = document.getElementById("options") 
    const formTitle = document.getElementById("formTitle") 
    const settings = common.settingsStore.get();
    formTitle.innerHTML = "Segments to include (" + settings.FTSorFAL + ")"  
    let i = 1;
    //console.log(routeInfo)
    for (let segment of segmentData) {
        
            let label = document.createElement('label');
            let key = document.createElement('key');
            let input = document.createElement('input');
            input.type = "checkbox";
            input.checked = true;
            //input.name = "eventSegData" + "|" + routeInfo.sg + "|" + segment.id + "|" + segment.repeat;
            if (segment.repeat > 1) {
                key.innerHTML = segment.name + " [" + segment.repeat + "]" + ":";
            } else {
                key.innerHTML = segment.name + ":";
            }
            label.appendChild(key);
            label.appendChild(input);
            segmentsForm.appendChild(label);
            i++;
        
    }
    */
    //debugger
}

export async function buildPointsTable(segmentData, currentEventConfig) {
    // Create the table element
    const table = document.createElement('table'); 
    table.id = "segmentsTable"
    let existingConfig = currentEventConfig ? true : false;    
    // Loop through each segment to create rows
    segmentData.forEach(segment => {
        //debugger
        let existingSegment;
        if (existingConfig) {
            existingSegment = currentEventConfig.segments.find(x => x.segmentId == segment.id && x.repeat == segment.repeat)
        }
        const row = document.createElement('tr');        
        const nameCell = document.createElement('td');
        nameCell.textContent = `${segment.name} [${segment.repeat}]`;
        row.appendChild(nameCell);

        const segidCell = document.createElement('td');
        segidCell.innerText = segment.id;
        segidCell.hidden = true;
        row.appendChild(segidCell);

        const segRepeatCell = document.createElement('td');
        segRepeatCell.innerText = segment.repeat;
        segRepeatCell.hidden = true;
        row.appendChild(segRepeatCell);

        const cbCell = document.createElement('td')
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = existingConfig ? existingSegment.enabled : true;
        cbCell.appendChild(checkbox)
        row.appendChild(cbCell)
        
        const selectCell = document.createElement('td');
        const select = document.createElement('select');
        ["FTS + FAL", "FTS", "FAL"].forEach(optionValue => {
        const option = document.createElement('option');
        option.value = optionValue.replace(" + ", ",");
        option.textContent = optionValue;
        select.appendChild(option);
        });
        if (existingConfig) {
            select.value = existingSegment.scoreFormat;
            select.disabled = !existingSegment.enabled;
        }
        selectCell.appendChild(select);
        row.appendChild(selectCell);
        
        table.appendChild(row);
    });
    
    
    table.addEventListener('change', function(event) {
        // Check if the event target is a checkbox
        if (event.target.type === 'checkbox') {
          // Find the row containing the checkbox
          const row = event.target.closest('tr');
          
          // Get the select and text inputs in the same row
          const select = row.querySelector('select');
          //const textInput = row.querySelector('input[type="text"]');
          
          // Enable or disable the inputs based on the checkbox state
          const isChecked = event.target.checked;
          select.disabled = !isChecked;
          //textInput.disabled = !isChecked;
        }
    });
    return table;
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

export function selectObject2(array, properties) {
    return array.map(item => {
        let selectedItem = {};
        properties.forEach(prop => {
            if (item.hasOwnProperty(prop)) {
                selectedItem[prop] = item[prop];
            }
        });
        return selectedItem;
    });
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

export function formatTs(timestamp) {
    const date = new Date(timestamp); // Convert Unix timestamp to milliseconds
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    };
    return date.toLocaleString('en-US', options);
}

export const formatTime = (milliseconds,timePrecision) => {    
    const ms = milliseconds.toString().substr(-3).slice(0,timePrecision);    
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60);                
    const hours = Math.floor((milliseconds / 1000 / 60 / 60) % 60);     
    if (hours != 0)
    {
        return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    }
    if (minutes != 0)
    {
        return minutes.toString().padStart(1, "0") + ":" + seconds.toString().padStart(2, "0") + "." + ms;
    }
    else
    {
        return seconds.toString().padStart(1, "0") + "." + ms;
    }
}

export const formatTime2 = (milliseconds, timePrecision = 3) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = milliseconds % 1000;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Truncate milliseconds without rounding
    const msString = ms.toString().padStart(3, '0').slice(0, timePrecision);

    // Build the time string dynamically
    let timeString = '';
    if (hours > 0) timeString += `${hours}:`;
    if (minutes > 0 || hours > 0) timeString += `${minutes.toString().padStart(hours > 0 ? 2 : 1, '0')}:`;
    timeString += `${seconds.toString().padStart((minutes > 0 || hours > 0) ? 2 : 1, '0')}`;

    if (timePrecision > 0) {
        timeString += `.${msString.padEnd(timePrecision, '0')}`;
    }

    return timeString;
};


export function getEventPowerups(sg) {
    let powerUps = {};
    const puList = {
        0: 'feather',
        1: 'draft',
        2: 'smallXP',
        3: 'largeXP',
        4: 'burrito',
        5: 'aero',
        6: 'ghost',
        7: 'steamroller',
        8: 'anvil'
    }
    const customPowerups = sg?.allTags.filter(tag => tag.includes('powerup'))    
    if (customPowerups?.length > 0) {
        customPowerups.sort(); // if there are arch powerups, we want this first in the array as they take precedence over powerup_percent
        let customPU = customPowerups[0].split("=")
        powerUps.type = customPU[0]
        const puResult = {};
        if (powerUps.type == "powerup_percent") { // powerups are randomly selected at each arch according to percentages returned
            const puParts = customPU[1].split(',')
            const puPairs = puParts.map(part => part.replace(/[^0-9]/g, '')).filter(part => part !== ''); // strip out anything that isn't a number
            for (let i = 0; i < puPairs.length; i += 2) {
                const puKey = puList[puPairs[i]]
                const puValue = parseInt(puPairs[i + 1])
                puResult[puKey] = puValue
            }
        } else if (powerUps.type == "arch_powerup") { // powerups are designated at returned arches
            const puPairs = customPU[1].replace(/"/g, '').split(",")
            for (let i = 0; i < puPairs.length; i += 2) {
                const puKey = puPairs[i];
                const puValue = puList[puPairs[i + 1]]
                puResult[puKey] = puValue
            }
        }
        powerUps.powerups = puResult        
    } else if (sg?.rulesId & 1 == 1 || sg?.eventType == "TIME_TRIAL" || sg?.eventType == "TEAM_TIME_TRIAL") { // bitwise rule 1 match or iTT / TTT
        powerUps.type = "nopowerups"    
    } else if (sg?.eventType == "GROUP_WORKOUT") {
        powerUps.type = "other"
    } else {
        powerUps.type = "standard"        
    }
    return powerUps;
}

export function calculateDistance(point1, point2) {
    const dx = point2[0] - point1[0]; // x2 - x1
    const dy = point2[1] - point1[1]; // y2 - y1
    const dz = point2[2] - point1[2]; // z2 - z1

    // Use the Euclidean distance formula
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function calculateTangent(road, roadPercent) {
    const epsilon = 0.001; // A small step to approximate the derivative
    const p1 = road.curvePath.pointAtRoadPercent(roadPercent);
    const p2 = road.curvePath.pointAtRoadPercent(Math.min(roadPercent + epsilon, 1)); // Ensure we stay within bounds

    return [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]; // Approximate tangent vector
}

function dotProduct(v1, v2) {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}


function getNearestPoint(road1, road2, road1RP, steps) {
    let nearestPoint = null;
    let minDistance = Infinity;
    let rp = null; 
    let pt1 = road1.curvePath.pointAtRoadPercent(road1RP)   
    //const tangent1 = calculateTangent(road1, road1RP); //pure ChatGPT, I don't actually know if this works
    const points = [];
    const step = 1 / (steps - 1); // Calculate the step size
    //const allClosePoints = [];
    //debugger
    for (let i = 0; i < steps; i++) {
        points.push(i * step);
    }
    
    for (let t of points) {
        //debugger
        if (t == undefined) {
            debugger
        }
        const pointOnSecondCurve = road2.curvePath.pointAtRoadPercent(t);    
        const distance = calculateDistance(pt1, pointOnSecondCurve);
        //const directionVector = [
        //    pointOnSecondCurve[0] - pt1[0],
        //    pointOnSecondCurve[1] - pt1[1],
        //    pointOnSecondCurve[2] - pt1[2]
        //]; //pure ChatGPT, I don't actually know if this works
        //let dotP = dotProduct(tangent1, directionVector); //pure ChatGPT, I don't actually know if this works
        if (distance < minDistance) {            
            minDistance = distance;
            nearestPoint = pointOnSecondCurve;
            rp = t;
            //allClosePoints.push({
            //    distance: distance,
            //    nearestPoint: pointOnSecondCurve,
            //    rp: t
            //})
        } 
        if (distance < 50) {
            //less than 1m is close enough
            break;
        } 
    }
    //console.log(rp)
    //debugger
    return rp;
}

export async function getManifestGapDistance(first, next, courseId) {
    const exitPoint = first.reverse ? first.start : first.end
    const entryPoint = next.reverse ? next.end : next.start
    let road1 = await common.getRoad(courseId, first.roadId)
    let road2 = await common.getRoad(courseId, next.roadId)
    const distanceBetween = calculateDistance(road1.curvePath.pointAtRoadPercent(exitPoint), road2.curvePath.pointAtRoadPercent(entryPoint))
    return distanceBetween;
}

export async function validateManifest(route) {
    //debugger
    let routeManifest = route.manifest;
    let courseId = route.courseId
    //let originalManifest = JSON.parse(JSON.stringify(routeManifest))
    let allGaps = [];
    const intersections = await fetch(`data/worlds/${common.courseToWorldIds[courseId]}/roadIntersections.json`).then(response => response.json());
    const allRoads = await common.getRoads(courseId)
    for (let i = 0; i < routeManifest.length - 1; i++) {
        
        let missingManifest = await fixMissingManifest(routeManifest[i], routeManifest[i+1], intersections, route)
        if (missingManifest.length > 0) {
            const manifestEntry = {
                reverse: missingManifest[0].option.forward ? false : true,
                roadId: missingManifest[0].option.road,
                end: missingManifest[0].option.forward ? missingManifest[0].option.exitTime : 1,
                start: missingManifest[0].option.forward ? 0 : missingManifest[0].option.exitTime 
            }
            routeManifest.splice(i + 1, 0, manifestEntry)
            //debugger
        }
        let gapAfter;
        let gapBefore = await getManifestGapDistance(routeManifest[i], routeManifest[i+1], courseId)        
        let gap = Math.trunc(gapBefore / 100)
        if (gap > 10) {
            //console.log("Fixing gap of", gap, "m for manifest entry", i)
            await fixManifestGap(routeManifest[i], routeManifest[i+1], intersections, allRoads, route)
            let fixedGap = await getManifestGapDistance(routeManifest[i], routeManifest[i+1], courseId)
            gapAfter = Math.trunc(fixedGap / 100)
            //console.log("Gap post fix:", gapAfter)
        }
        allGaps.push({
            [i]: gapAfter !== undefined ? gapAfter : gap,
            gapBefore: Math.trunc(gapBefore / 100),
            sameRoad: routeManifest[i].roadId == routeManifest[i+1].roadId ? true : false
        })
        if (routeManifest[i].end < routeManifest[i].start) {
            //console.log("This isn't a valid manifest entry", routeManifest[i])
            routeManifest[i].end = routeManifest[i].start
            //debugger
        }
    }
    // validate the last entry
    const lastManifestEntry = routeManifest.at(-1)
    if (lastManifestEntry.end < lastManifestEntry.start) {
        //console.log("Trying to fix last manifest entry")
        lastManifestEntry.end = lastManifestEntry.start
    }
    // fix bad manifest entries
    if (route.supportedLaps) {
        //does the end of the lap align with the end of the leadin?        
        const notLeadin = routeManifest.findIndex(x => !x.leadin); 
        const lapStart = routeManifest[notLeadin]
        const lapEnd = routeManifest.at(-1)
        let lapFiller = [];
        route.lapFiller = {};
        if (lapStart.roadId == lapEnd.roadId && lapStart.reverse == lapEnd.reverse) {
            const startTime = lapStart.reverse ? lapStart.end : lapStart.start
            const endTime = lapStart.reverse ? lapEnd.start : lapEnd.end
            // consider extending the first manifest entry of next lap rather than adding to it
            if (!lapStart.reverse && endTime > startTime) {
                //need to split lapFiller across 0/1 boundary
                if (lapEnd.end > lapStart.start && lapEnd.end < lapStart.end) {
                    //overlap
                } else {
                    lapFiller = [
                        {
                            end: 1,
                            reverse: false,
                            roadId: lapEnd.roadId,
                            start: lapEnd.end
                        },
                        {
                            end: lapStart.start,
                            reverse: false,
                            roadId: lapStart.roadId,
                            start: 0
                        }
                    ]
                }
            } else if (lapStart.reverse && endTime < startTime) {                
                //debugger
                if (lapEnd.start < lapStart.end && lapEnd.start > lapStart.start) {
                    //overlap
                } else {
                    lapFiller = [
                        {
                            end: lapEnd.start,
                            reverse: true,
                            roadId: lapEnd.roadId,
                            start: 0
                        },
                        {
                            end: 1,
                            reverse: true,
                            roadId: lapStart.roadId,
                            start: lapEnd.end
                        }
                    ]
                }
            } else if (startTime != endTime) {
                lapFiller = [
                    {
                        end: lapStart.reverse ? lapEnd.start : lapStart.start,
                        reverse: lapStart.reverse,
                        roadId: lapStart.roadId,
                        start: lapStart.reverse ? lapStart.end : lapEnd.end
                    }
                ]
            }
        } else if (route.extraManifest) {
            lapFiller = route.extraManifest
        }
        //debugger
        if (lapFiller.length > 0) {
            //console.log("Lap filler manifest", lapFiller)            
            route.lapFiller.curvePath = new curves.CurvePath()
            route.lapFiller.roadSegments = []
            const worldList = await common.getWorldList();
            const worldMeta = worldList.find(x => x.courseId === route.courseId);
            for (const [i, x] of lapFiller.entries()) {
                // road building magic borrowed from Sauce
                const road = await common.getRoad(route.courseId, x.roadId);
                const seg = road.curvePath.subpathAtRoadPercents(x.start, x.end);
                seg.reverse = x.reverse;
                seg.leadin = x.leadin;
                seg.roadId = x.roadId;
                for (const xx of seg.nodes) {
                    xx.index = i;
                }
                route.lapFiller.roadSegments.push(seg);
                route.lapFiller.curvePath.extend(x.reverse ? seg.toReversed() : seg);
            }
            const supPath = common.supplimentPath || supplimentPath;
            Object.assign(route.lapFiller, supPath(worldMeta, route.lapFiller.curvePath));
        }
        route.lapFiller.manifest = lapFiller;
        
    }
    return allGaps;
}

async function fixMissingManifest(first, next, intersections, route) {
    const roadIntersections = intersections.find(int => int.id === first.roadId) || []; 
    const direction = first.reverse ? "reverse" : "forward";
    next.reverse = next.reverse ? true : false; // make sure reverse has a value
    let validIntersections = [];
    if (first.roadId == next.roadId && !first.leadin) {
        
        //debugger
        if ((!first.reverse && first.end > 0.99 && next.start < 0.01) || (first.reverse && first.start < 0.01 && next.end > 0.99)) {
            //console.log("we are just crossing a 0/1 line, this is ok")
            return [];
        }
        //console.log("Why are we going to the same road but not switching from leadin to route?", first, next)
        if (!route.decisions) {
            //grab the route decisions if we haven't already done so
            route.decisions = await fetch(`data/worlds/${route.worldId}/routeDecisions.json`).then(response => response.json()).then(routes => routes.find(x => parseInt(x.id) == route.id));
        }
        const roadIntersections = intersections.find(int => int.id === first.roadId); 
        const direction = first.reverse ? "reverse" : "forward";
        next.reverse = next.reverse ? true : false; // make sure reverse has a value
        const manifestIntersections = roadIntersections.intersections.filter(x => x.m_roadTime1 > first.start && x.m_roadTime2 < first.end) // look for an intersection on the most recent manifest
        if (manifestIntersections.length > 0) {
            // we found possible intersections, see if any were on the decision list
            const validDecision = route.decisions?.decisions.find(x => {return manifestIntersections.some(m => m.m_markerId == x.markerId.toString())})
            if (validDecision) {
                if (validDecision.forward == "1") {
                    const turn = (() => {
                        switch (validDecision.turn) {
                            case "0":
                                return 262;
                            case "1":
                                return 263;
                            case "3":
                                return 265;
                            default:
                                return null; // or some default value if no match
                        }
                    })();
                    const decisionInt = roadIntersections.intersections.find(x => x.m_markerId == validDecision.markerId)                    
                    const opt = decisionInt.forward.find(x => x.option.alt == turn)
                    validIntersections.push(opt)
                    //debugger
                }                
            }
            //console.log("Ok we found a intersection in the decision that wasn't in the manifest, added", validIntersections)
            return validIntersections
        }
        //return validIntersections;
    
    } 
    if (validIntersections.length == 0 && roadIntersections) {
        validIntersections = roadIntersections.intersections?.flatMap(i => i[direction]?.map(option => ({ option: option.option, intersection: i }))).filter(o => o.option?.road == next.roadId && o.option?.forward != next.reverse);
    }
    if (validIntersections?.length == 0 && !first.leadin) {
        //console.log("No valid intersections found", first.roadId, "=>", next.roadId)    
        //debugger    
        if (!route.decisions) {
            //grab the route decisions if we haven't already done so
            route.decisions = await fetch(`data/worlds/${route.worldId}/routeDecisions.json`).then(response => response.json())
            .then(routes => Array.isArray(routes) ? routes : [routes])
            .then(routes => routes.find(x => parseInt(x.id) == route.id));
        }
        //debugger
        const matchingIntersections = roadIntersections.intersections.filter(int => {
            return route.decisions?.decisions.some(decision => decision.markerId === int.m_markerId.toString());
        });
        for (let int of matchingIntersections) {
            let intOptions = int[direction]
            for (let opt of intOptions) {
                let intIntersections = intersections.find(x => x.id == opt.option?.road)
                //if (opt.option.road == 41) {
                    let optionDirection = opt.option?.forward ? "forward" : "reverse"
                    let pathSearch = intIntersections?.intersections.find(x => x[optionDirection].find(o => o.option?.road == next.roadId && o.option?.forward != next.reverse))
                    if (pathSearch) {         
                        validIntersections.push(opt)
                        //console.log("Found a way to get from", first.roadId, "=>", next.roadId, "via road", opt.option?.road, "option", validIntersections)                          
                    }
                //}
            }
            //debugger
        }
        //debugger
        return validIntersections;
    }
    return [];
}

async function fixManifestGap(first, next, intersections, allRoads, route) {
    
    if (next.start > 1 && next.end > 1) {
        //bad manifest entry (only seen in Astorla line 8?)
        //console.log("Discarding bad manifest entry", next)
        const idx = route.manifest.indexOf(next)
        if (idx != -1) {
            route.manifest.splice(idx, 1)
        }
        return
    }
    if (first.roadId == next.roadId) {
        if (first.leadin) {
            if (first.reverse) {
                //first.start = next.end;
                next.end = first.start; // bring next manifest back to the banner
            } else {
                //first.end = next.start;
                next.start = first.end;
            }
        } else {
            //console.log("Why are we going to the same road but not switching from leadin to route?")
        }
    } else {
        const roadIntersections = intersections.find(int => int.id === first.roadId); 
        const direction = first.reverse ? "reverse" : "forward";
        next.reverse = next.reverse ? true : false; // make sure reverse has a value
        let validIntersections = roadIntersections.intersections?.flatMap(i => i[direction]?.map(option => ({ option: option.option, intersection: i }))).filter(o => o.option?.road == next.roadId && o.option?.forward != next.reverse);
        if (validIntersections?.length > 1) {
            //console.log("More than one valid intersection on this road?", first.roadId, "=>", next.roadId, validIntersections) // not sure if this can ever happen
            if (!route.decisions) {
                //grab the route decisions if we haven't already done so
                route.decisions = await fetch(`data/worlds/${route.worldId}/routeDecisions.json`).then(response => response.json()).then(routes => routes.find(x => parseInt(x.id) == route.id));
            }
            const matchingIntersections = validIntersections.filter(int => {
                return route.decisions?.decisions.some(decision => decision.markerId === int.intersection.m_markerId.toString());
            });
            if (matchingIntersections.length == 1) {
                // we found only one matching intersection decision in the route, we'll use that
                validIntersections = matchingIntersections
            }
            if (validIntersections.length > 1) {
                //console.log("We still have more than one valid intersection for this road", first.roadId, "=>", next.roadId, validIntersections)
            }
            //debugger
        }

        if (validIntersections?.length == 0) {
            //console.log("No valid intersections found", first.roadId, "=>", next.roadId)
            if (!route.decisions) {
                //grab the route decisions if we haven't already done so
                route.decisions = await fetch(`data/worlds/${route.worldId}/routeDecisions.json`).then(response => response.json()).then(routes => routes.find(x => parseInt(x.id) == route.id));
            }
            //debugger
            const matchingIntersections = roadIntersections.intersections.filter(int => {
                return route.decisions?.decisions.some(decision => decision.markerId === int.m_markerId.toString());
            });
            for (let int of matchingIntersections) {
                let intOptions = int[direction]
                for (let opt of intOptions) {
                    let intIntersections = intersections.find(x => x.id == opt.option?.road)
                    //if (opt.option.road == 41) {
                        let optionDirection = opt.option?.forward ? "forward" : "reverse"
                        let pathSearch = intIntersections?.intersections.find(x => x[optionDirection].find(o => o.option?.road == next.roadId && o.option?.forward != next.reverse))
                        if (pathSearch) {         
                            validIntersections.push(opt)  
                            //console.log("Found a way to get from", first.roadId, "=>", next.roadId, "via road", opt.option?.road, "option", validIntersections)                          
                        }
                    //}
                }
                //debugger
            }
            //debugger
        }
        if (validIntersections?.length == 1) {
            //debugger
            //const epsilon = 0.00
            //const rdLength = await measureRoadLength(next, route.courseId)
            //const diff = next.end - next.start;
            //const rdRatio = diff / rdLength
            //const epsilon = rdRatio
            
            //console.log("Next road", next, "length", rdLength, "episilon", epsilon)
            //debugger
            const option = validIntersections[0] // not sure if this can ever be > 1 valid intersection or not                
            if (option) {               
                //direction == "reverse" ? first.start = option.option.exitTime + epsilon : first.end = option.option.exitTime - epsilon;
                direction == "reverse" ? first.start = option.option.exitTime : first.end = option.option.exitTime;
                const road1 = allRoads.find(x => x.id == first.roadId)
                const road2 = allRoads.find(x => x.id == next.roadId)
                const road1RP = direction == "reverse" ? first.start : first.end
                
                let rd2Entry = getNearestPoint(road1, road2, road1RP, 25000)
                // deal with next road start or end being 0 or 1                
                if (!next.reverse && (rd2Entry > next.end || route.id == 2007026433)) { // 2019 Harrogate workaround
                    // the next manifest will be invalid, see if we are close to a 0/1 boundary
                    if (next.start <= 0.01 && rd2Entry >= 0.99) {
                        // the next manifest was starting at or close to 0 while the calculated entry was close to 1, just leave it at the original value
                        rd2Entry = next.start
                    }
                } else if (next.reverse && rd2Entry < next.start) {
                    // the next manifest will be invalid, see if we are close to a 0/1 boundary
                    if (next.end >= 0.99 && rd2Entry <= 0.01) {
                        // the next manifest was starting at or close to 1 while the calculated entry was close to 0, just leave it at the original value
                        rd2Entry = next.end
                    }
                }
                //debugger
                if (rd2Entry != null) {
                    //console.log("rd2entry is ", rd2Entry)
                    if (next.reverse) {
                        if (rd2Entry > next.start) {
                            //next.end = rd2Entry - epsilon
                            next.end = rd2Entry
                        } else {
                            next.end = rd2Entry
                        }
                    } else {
                        if (rd2Entry < next.end) {
                            //next.start = rd2Entry + epsilon
                            next.start = rd2Entry
                        } else {
                            next.start = rd2Entry
                        }
                    }
                    //next.reverse ? next.end = rd2Entry - epsilon : next.start = rd2Entry + epsilon;
                }
                //debugger
                
            }
        } else {
            //console.log("No valid intersections found", first.roadId, "=>", next.roadId)
            //debugger
        }
            
    }
    //console.log("After next is", next)
}

export async function getRoadsIntersectionRP(courseId, road1, road2, road1RP, steps) {
    let nearestPoint = null;
    let minDistance = Infinity;
    let rp = null;        
    let rd1 = await common.getRoad(courseId, road1)
    // the point where distance measurements start in game (ie. the "magic line").  This can either come from the paddockExitRoadTime definition on the road or it's the last roadPercent before the game switches to the route road
    let pt1 = rd1.curvePath.pointAtRoadPercent(road1RP) 
    //pt1 = rd1.curvePath.pointAtRoadTime(0.99) 
    let rd2 = await common.getRoad(courseId, road2)
    const points = [];
    const step = 1 / (steps - 1); // Calculate the step size

    for (let i = 0; i < steps; i++) {
        points.push(i * step);
    }
    for (let t of points) {
        const pointOnSecondCurve = rd2.curvePath.pointAtRoadPercent(t); // Get a point on the second curve for parameter t
    
        const distance = calculateDistance(pt1, pointOnSecondCurve);
    
        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = pointOnSecondCurve;
            rp = t;
        }
        if (distance < 100) {
            //close enough
            break;
        }
    }
    return { nearestPoint, minDistance, rp };
}

async function isBannerNearby(lastManifestEntry, courseId, type) {
    //if (lastManifestEntry.roadId == 77 && lastManifestEntry.reverse && type == "leadin") {
        // ignore the leadin for InnsbruckConti
    //    return;
    //}
    const worldSegments = await common.rpc.getSegments(courseId)
    //const roadSegments = worldSegments.filter(x => x.roadId == lastManifestEntry.roadId && (x.reverse == lastManifestEntry.reverse || (x.reverse == false && lastManifestEntry.reverse == null)));
    const roadSegments = worldSegments.filter(x => x.roadId == lastManifestEntry.roadId);
    
    let nearbySegment;
    if (roadSegments.length > 0) {  
        if (lastManifestEntry.reverse) {
            nearbySegment = roadSegments.filter(x => x.roadFinish + 0.1 > lastManifestEntry.start && x.roadFinish - 0.1 < lastManifestEntry.start )
            let closestSegment;
            if (nearbySegment.length > 0) {
                closestSegment = nearbySegment.reduce((closest, segment) => {
                    return Math.abs(segment.roadFinish - lastManifestEntry.start) < Math.abs(closest.roadFinish - lastManifestEntry.start) ? segment : closest;
                });
                //debugger
                //console.log("Changing", type, " manifest entry to ", closestSegment.name, "banner.  From", lastManifestEntry.start, "to", addSmallIncrement(closestSegment.roadFinish, -1))
                if (closestSegment.roadFinish < lastManifestEntry.end) { // make sure the segment isn't behind the pen
                    lastManifestEntry.start = addSmallIncrement(closestSegment.roadFinish, -1) // just past the banner to avoid duplicate segment detection
                }
            } else {                
                //console.log("Can't find a nearby banner to", lastManifestEntry)
                //debugger
                // Yorkshire has issues with being close to the 0/1 line but I don't think I care because it's pretty good already
            }
        } else {
            nearbySegment = roadSegments.filter(x => x.roadFinish + 0.1 > lastManifestEntry.end && x.roadFinish - 0.1 < lastManifestEntry.end)
            let closestSegment;
            if (nearbySegment.length > 0) {
                closestSegment = nearbySegment.reduce((closest, segment) => {
                    return Math.abs(segment.roadFinish - lastManifestEntry.end) < Math.abs(closest.roadFinish - lastManifestEntry.end) ? segment : closest;
                });
                //debugger
                //console.log("Changing", type, "manifest entry to ", closestSegment.name, "banner.  From", lastManifestEntry.end, "to", addSmallIncrement(closestSegment.roadFinish, 1))
                if (closestSegment.roadFinish > lastManifestEntry.start) { // make sure the segment isn't behind the pen
                    lastManifestEntry.end = addSmallIncrement(closestSegment.roadFinish, 1)
                }
            } else {
                //console.log("Can't find a nearby banner to", lastManifestEntry)
            }
        }
    } else {
        //console.log("There are no segment banners on the final road in the ", type , lastManifestEntry)
    }
}

function addSmallIncrement(rp, plusMinus) {    
    let precision = rp.toString().split('.')[1]?.length || 0;  // Determine the precision based on the number of decimal places in the rp
    precision = precision <= 10 ? 10 : precision // min precision of 10    
    const increment = plusMinus / Math.pow(10, precision + 1); // Calculate a small increment scaled to the precision
    let finalRP = rp + increment;
    finalRP = (finalRP > 1 || finalRP < 0) ? rp : finalRP // if the increment is above 1 or below 0, just use the original
    return rp + increment;
}


export function getUniqueValues(arr, property) {
    const uniqueValues = [];
    const map = new Map();
  
    for (const item of arr) {
      if (!map.has(item[property])) {
        map.set(item[property], true);   
        uniqueValues.push(item[property]);
      }
    }
  
    return uniqueValues;
  }

export async function openSegmentConfigDB() {
    return new Promise((resolve, reject) => {
        const segmentConfigDB = indexedDB.open("segmentResultsDatabase", 5)
        segmentConfigDB.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("segmentResults")) {
                console.log("Creating segmentResults store")
                const store = db.createObjectStore("segmentResults", {keyPath: "id"});
                store.createIndex("eventSubgroupId", "eventSubgroupId", {unique: false})
                store.createIndex("athleteId", "athleteId", {unique: false})
                store.createIndex("segmentId", "segmentId", {unique: false})
                store.createIndex("ts", "ts", {unique: false})
            }
            if (!db.objectStoreNames.contains("segmentResultsLive")) {
                console.log("Creating segmentResultsLive store")
                const store = db.createObjectStore("segmentResultsLive", {keyPath: "id"});
                store.createIndex("eventSubgroupId", "eventSubgroupId", {unique: false})
                store.createIndex("athleteId", "athleteId", {unique: false})
                store.createIndex("segmentId", "segmentId", {unique: false})
                store.createIndex("ts", "ts", {unique: false})
            }
            if (!db.objectStoreNames.contains("segmentConfig")) {
                console.log("Creating segmentConfig store")
                const store = db.createObjectStore("segmentConfig", {keyPath: "eventSubgroupId"});                
                store.createIndex("ts", "ts", {unique: false})
            }
            if (!db.objectStoreNames.contains("scoringConfig")) {
                console.log("Creating scoringConfig store")
                const store = db.createObjectStore("scoringConfig", {keyPath: "name"});
            }
        };
        segmentConfigDB.onsuccess = async function(event) {
            const dbSegmentConfig = event.target.result;
            console.log("Config Database initialized");
            resolve(dbSegmentConfig);
        };
        segmentConfigDB.onerror = function(event) {
            console.log("Config Database failed to open:", event.target.error);
            reject(event.target.error)
        };
    });
}

export async function openSegmentsDB() {
    return new Promise((resolve, reject) => {
        const segmentResultsDB = indexedDB.open("segmentResultsDatabase", 5)
        segmentResultsDB.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("segmentResults")) {
                console.log("Creating segmentResults store")
                const store = db.createObjectStore("segmentResults", {keyPath: "id"});
                store.createIndex("eventSubgroupId", "eventSubgroupId", {unique: false})
                store.createIndex("athleteId", "athleteId", {unique: false})
                store.createIndex("segmentId", "segmentId", {unique: false})
                store.createIndex("ts", "ts", {unique: false})
            }
            if (!db.objectStoreNames.contains("segmentResultsLive")) {
                console.log("Creating segmentResultsLive store")
                const store = db.createObjectStore("segmentResultsLive", {keyPath: "id"});
                store.createIndex("eventSubgroupId", "eventSubgroupId", {unique: false})
                store.createIndex("athleteId", "athleteId", {unique: false})
                store.createIndex("segmentId", "segmentId", {unique: false})
                store.createIndex("ts", "ts", {unique: false})
            }
            if (!db.objectStoreNames.contains("segmentConfig")) {
                console.log("Creating segmentConfig store")
                const store = db.createObjectStore("segmentConfig", {keyPath: "eventSubgroupId"});                
                store.createIndex("ts", "ts", {unique: false})
            }
            if (!db.objectStoreNames.contains("scoringConfig")) {
                console.log("Creating scoringConfig store")
                const store = db.createObjectStore("scoringConfig", {keyPath: "name"});
            }
        };
        segmentResultsDB.onsuccess = async function(event) {
            const dbSegments = event.target.result;
            console.log("Database initialized");
            resolve(dbSegments);
        };
        segmentResultsDB.onerror = function(event) {
            console.log("Database failed to open:", event.target.error);
            reject(event.target.error)
        };
    });
}

export async function cleanupSegmentsDB(dbSegments, options) {
    return new Promise((resolve, reject) => {
        const storeName = options?.live ? "segmentResultsLive" : "segmentResults"
        const transaction = dbSegments.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const index = store.index("ts");

        const now = Date.now();
        const cutoff = now - 7 * 24 * 60 * 60 * 1000; 

        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

        let deletedCount = 0;

        request.onsuccess = function (event) {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete(); 
                deletedCount++;
                cursor.continue(); 
            }
        };

        request.onerror = function (event) {
            console.error("Error cleaning up old entries:", event.target.error);
            reject(event.target.error);
        };

        transaction.oncomplete = function () {
            console.log(`Segments cleanup complete. Deleted ${deletedCount} old entries.`);
            resolve(deletedCount);
        };

        transaction.onerror = function (event) {
            console.error("Transaction failed during cleanup:", event.target.error);
            reject(event.target.error);
        };
    });
}

export async function cleanupSegmentConfigDB(dbSegmentConfig) {
    return new Promise((resolve, reject) => {
        const storeName = "segmentConfig"
        const transaction = dbSegmentConfig.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const index = store.index("ts");

        const now = Date.now();
        const cutoff = now - 7 * 24 * 60 * 60 * 1000; 

        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

        let deletedCount = 0;

        request.onsuccess = function (event) {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete(); 
                deletedCount++;
                cursor.continue(); 
            }
        };

        request.onerror = function (event) {
            console.error("Error cleaning up old entries:", event.target.error);
            reject(event.target.error);
        };

        transaction.oncomplete = function () {
            console.log(`Config cleanup complete. Deleted ${deletedCount} old entries.`);
            resolve(deletedCount);
        };

        transaction.onerror = function (event) {
            console.error("Transaction failed during cleanup:", event.target.error);
            reject(event.target.error);
        };
    });
}

export async function storeSegmentResults(dbSegments, resultsToStore, options) {
    return new Promise((resolve, reject) => {
        const storeName = options?.live ? "segmentResultsLive" : "segmentResults"
        //console.log("Saving results to store", storeName)
        const transaction = dbSegments.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName)
        let resultsCount = 0;
        resultsToStore.forEach(result => {
            const request = store.put(result);
            request.onsuccess = function () {
                resultsCount++;
                //console.log("Segment result saved:", result.id);
            };
            request.onerror = function (event) {
                console.error("Failed to save segment result:", event.target.error);
            };
        });
        transaction.oncomplete = function () {
            //console.log("All segment results processed.");
            resolve(resultsCount);
        };

        transaction.onerror = function (event) {
            console.error("Transaction error:", event.target.error);
            reject(event.target.error);
        };
    });
}

export async function storeKnownRacers(dbSegments, knownRacers) {
    return new Promise((resolve, reject) => {
        const transaction = dbSegments.transaction("knownRacers", "readwrite");
        const store = transaction.objectStore("knownRacers")
        let racerCount = 0;
        knownRacers.forEach(racer => {
            const request = store.put(racer);
            request.onsuccess = function () {
                racerCount++;
                //console.log("Segment result saved:", result.id);
            };
            request.onerror = function (event) {
                console.error("Failed to save segment result:", event.target.error);
            };
        });
        transaction.oncomplete = function () {
            //console.log("All segment results processed.");
            resolve(racerCount);
        };

        transaction.onerror = function (event) {
            console.error("Transaction error:", event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getKnownRacers(dbSegments, eventSubgroupId) {
    //console.log("Getting results for sg", eventSubgroupId, "from", dbSegments);
    if (!dbSegments) {
        console.error("Database connection is invalid!");
        return [];
    }
    return new Promise((resolve, reject) => {
        try {
            /*
            const transaction = dbSegments.transaction("knownRacers", "readonly");
            const store = transaction.objectStore("knownRacers");
            const index = store.index("eventSubgroupId");
            //console.log("Starting query for eventSubgroupId:", eventSubgroupId);

            const request = index.getAll(eventSubgroupId);
            */
            
            const transaction = dbSegments.transaction("segmentResults", "readonly");
            const store = transaction.objectStore("segmentResults");
            const index = store.index("eventSubgroupId");
            //console.log("Starting query for eventSubgroupId:", eventSubgroupId);

            const request = index.getAll(eventSubgroupId);
            
            request.onsuccess = function () {                
                //console.log("Query success. Retrieved", request.result.length, "entries");
                //debugger
                let idResult = request.result.map(({ athleteId, eventSubgroupId }) => ({ athleteId, eventSubgroupId }));
                resolve(idResult)
                //resolve(request.result);
            };

            request.onerror = function (event) {
                console.error("Error fetching known racers by eventSubgroupId:", event.target.error);
                reject(event.target.error);
            };

            transaction.oncomplete = function () {
                //console.log("Transaction completed successfully.");
            };

            transaction.onerror = function (event) {
                console.error("Transaction error:", event.target.error);
                reject(event.target.error);
            };
        } catch (error) {
            console.error("Unexpected error in getKnownRacers:", error);
            reject(error);
        }
    });
}

export async function getSegmentResults(dbSegments, eventSubgroupId, options) {
    //console.log("Getting results for sg", eventSubgroupId, "from", dbSegments);
    if (!dbSegments) {
        console.error("Database connection is invalid!");
        return [];
    }
    options = options ? options : {live: false}
    const storeName = options.live ? "segmentResultsLive" : "segmentResults";
    //console.log("Getting segment results from", storeName)
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbSegments.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const index = store.index("eventSubgroupId");
            //console.log("Starting query for eventSubgroupId:", eventSubgroupId);

            const request = index.getAll(eventSubgroupId);
            request.onsuccess = function () {                
                //console.log("Query success. Retrieved", request.result.length, "entries");
                resolve(request.result);
            };

            request.onerror = function (event) {
                console.error("Error fetching entries by eventSubgroupId:", event.target.error);
                reject(event.target.error);
            };

            transaction.oncomplete = function () {
                //console.log("Transaction completed successfully.");
            };

            transaction.onerror = function (event) {
                console.error("Transaction error:", event.target.error);
                reject(event.target.error);
            };
        } catch (error) {
            console.error("Unexpected error in getSegmentResults:", error);
            reject(error);
        }
    });
}

export function getEventConfig(dbSegmentConfig, eventSubgroupId) {
    if (!dbSegmentConfig) {
        console.error("Database connection is invalid!");
        return [];
    }
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbSegmentConfig.transaction("segmentConfig", "readonly");
            const store = transaction.objectStore("segmentConfig");
            const request = eventSubgroupId ? store.get(eventSubgroupId) : store.getAll();

            request.onsuccess = function () {                
                //console.log("Query success. Retrieved", request.result.length, "entries");
                resolve(request.result);
            };

            request.onerror = function (event) {
                console.error("Error fetching entries by eventSubgroupId:", event.target.error);
                reject(event.target.error);
            };

            transaction.oncomplete = function () {
                //console.log("Transaction completed successfully.");
            };

            transaction.onerror = function (event) {
                console.error("Transaction error:", event.target.error);
                reject(event.target.error);
            };
        } catch (error) {
            console.error("Unexpected error in getEventConfig:", error);
            reject(error);
        }
    });
}
export function getSavedScoreFormats(dbSegmentConfig) {
    if (!dbSegmentConfig) {
        console.error("Database connection is invalid!");
        return [];
    }
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbSegmentConfig.transaction("scoringConfig", "readonly");
            const store = transaction.objectStore("scoringConfig");
            const request = store.getAll();

            request.onsuccess = function () {                
                //console.log("Query success. Retrieved", request.result.length, "entries");
                resolve(request.result);
            };

            request.onerror = function (event) {
                console.error("Error fetching scoring entries:", event.target.error);
                reject(event.target.error);
            };

            transaction.oncomplete = function () {
                //console.log("Transaction completed successfully.");
            };

            transaction.onerror = function (event) {
                console.error("Transaction error:", event.target.error);
                reject(event.target.error);
            };
        } catch (error) {
            console.error("Unexpected error in getSavedScoreFormats:", error);
            reject(error);
        }
    });
}

//async function findPathFromAtoB(startRoad, startDirection, targetRoad, targetDirection, intersections, allRoads, route) {
export async function findPathFromAtoB(startPoint, endPoint, intersections, allRoads, courseId) {
    const targetRoad = endPoint.roadId;
    const targetDirection = endPoint.reverse;
    const startRoad = startPoint.roadId;
    const startDirection = !startPoint.reverse;
    let currentRP = startPoint.rp
    let maxDepth = 10 // if we make 6 or more total intersection decisions, we are lost
    //let maxNonPaddockRoads = 4; // if we run into 4 or more roads that aren't paddock roads, we are lost
    let path = [];
    let allPaths = [];
    let found = false;
    //debugger
    function explore(roadId, forward, depth, currentPath, exitTime) { 
        if (!allRoads.find(x => x.id == roadId)) {
            //console.log("Found a roadId that Sauce doesn't know about, ignoring roadId", roadId)
            return
        }
        if (depth > maxDepth) {
            return;
        } 
        if (roadId === targetRoad && forward != targetDirection) {
            //we found the target road but going the wrong way, we are lost
            return;
        } 
                
        //let currentRP = 0
        if (exitTime == -1) {
            //this must be the initial starting point, set the roadTime to 0 for a forward road and 1 for a reverse road
            //currentRP = forward ? 0 : 1
            exitTime = 0
            
        } else {
            //on the new road, find the nearest point to where we exited the last road
            const rd1 = allRoads.find(x => x.id == currentPath.at(-1).roadId)
            const rd2 = allRoads.find(x => x.id == roadId)                     
            currentRP = getNearestPoint(rd1, rd2, exitTime, 25000)            
        }
        // Add current road and direction to the path
        if (currentPath.some(pathEntry => pathEntry.roadId === roadId && pathEntry.forward === forward && pathEntry.exitTime === exitTime)) {
            //we've already been here, don't record it again
        } else {
            if (currentPath.length > 0) {
                currentPath.at(-1).exitTime = exitTime // set the exitTime for the previous entry
                currentPath.push({ roadId: roadId, forward: forward, exitTime: exitTime, entryTime: currentRP });
            } else {
                currentPath.push({ roadId: roadId, forward: forward, exitTime: exitTime, entryTime: currentRP });
            }
            if (roadId === targetRoad && forward === targetDirection) {
                //we found the target road in the right direction, add the current path as a valid path
                const validPath = JSON.parse(JSON.stringify(currentPath)) // not sure I need to do this but...
                allPaths.push(validPath)
                return;
            }
            //debugger
            // Look for intersections on the current road
            const currentIntersections = intersections.find(int => int.id === roadId);            
            if (currentIntersections.intersections) {            
                // Sort intersections by m_roadTime1 to ensure the decisions are made in sequence            
                currentIntersections.intersections.sort((a, b) => {
                    return a.m_roadTime1 > b.m_roadTime1;
                })
                let validIntersections = []; // filter only the intersections that are after our current roadPercent
                if (forward) {
                    validIntersections = currentIntersections.intersections.filter(x => x.m_roadTime2 > currentRP)
                } else {
                    validIntersections = currentIntersections.intersections.filter(x => x.m_roadTime1 < currentRP)
                }
                //debugger
                for (const intersection of validIntersections) {
                    // recursively look at intersection options in the direction we are going
                    if (forward) {
                        for (const option of intersection.forward) {
                            if (option.option) {                    
                                explore(option.option.road, option.option.forward, depth + 1, [...currentPath], option.option.exitTime);
                            }
                        }
                    } else {
                        for (const option of intersection.reverse) {
                            if (option.option) {            
                                explore(option.option.road, option.option.forward, depth + 1, [...currentPath], option.option.exitTime);
                            }
                        }
                    }
                }
            }
        }
    } 
    
    // Start exploring from the initial road and direction
    explore(startRoad, startDirection, 0, [], -1);
    //debugger
    
    let shortestDistance = Infinity;
    const worldList = await common.getWorldList();
    const worldMeta = worldList.find(x => x.courseId === courseId); 
    //debugger
    for (let thisPath of allPaths) {
        //console.log("Checking path", thisPath)
        let pathLength = 0
        for (let section of thisPath) {
            pathLength += await measureRoadSection(section, courseId)
        }
        //of all the possible exit paths we found, measure the length of the road and pick the shortest one
        //const exitPathDistance = await getExitPathDistance(exitPath, route, worldMeta)
        if (pathLength < shortestDistance) {
            shortestDistance = pathLength
            path = thisPath
        }
        console.log("This path", thisPath, "is", pathLength)
    }
    let bestPath = {};
    if (path) {
        found = true
        bestPath.path = path;
        bestPath.distance = shortestDistance;
        bestPath.manifest = [];
        path.forEach(road => {
            bestPath.manifest.push({
                start: road.forward ? road.entryTime : road.exitTime,
                end: road.forward ? road.exitTime : road.entryTime,
                reverse: !road.forward,
                roadId: road.roadId
            })
        })
        /*
        path.forEach(road => {
            road.paddockExitRoadTime = isPenExitRoad(road, intersections)
            road.isPaddockRoad = isPaddockRoad(road, intersections)
            road.isTargetRoad = isTargetRoad(road, targetRoad, targetDirection)
        })
        */
    }
    
    return found ? bestPath : null; // Return the path if found, otherwise null
  }
  async function measureRoadSection(section, courseId) {
    let tempCurvepath = new curves.CurvePath()
    const road = await common.getRoad(courseId, section.roadId)
    const seg = section.forward ? road.curvePath.subpathAtRoadPercents(section.entryTime, section.exitTime) : road.curvePath.subpathAtRoadPercents(section.exitTime, section.entryTime);
    seg.reverse = section.forward ? false : true
    seg.roadId = section.roadId
    tempCurvepath.extend(seg)
    const worldList = await common.getWorldList();
    const worldMeta = worldList.find(x => x.courseId === courseId);
    const supPath = common.supplimentPath || supplimentPath;
    const manifestData = supPath(worldMeta, seg);
    return manifestData.distances.at(-1);
}

export function getScoreFormat(scoreFormat, scoreStep) {
    if (scoreFormat?.includes(":")) { // Matlab colon notation 
        const ranges = scoreFormat.split(',');
        const generateRange = (start, step, end) => {
            const result = []; 
            if (step > 0) {
                step = step * -1;
            } else if (step == 0) {
                return [0]
            }
            for (let i = start; i >= end; i += step) {
                result.push(i);
            }            
            return result;
        };
        const scoreList = ranges.flatMap(range => {
            let [start, step, end] = range.split(':').map(Number); 
            step = parseInt(step) || 1;
            if (end == 0) {
                end = 1;
            }
            end = parseInt(end) || start;             
            return generateRange(parseInt(start), step, end);
        });

        return scoreList;
    } else {
        let scoreList = [];  
        if (scoreStep < 0) {
            scoreStep = scoreStep * -1; //make sure scoreStep is always positive
        } else if (scoreStep == 0) {
            scoreStep = 1;
        }
        if (scoreFormat)
        {
            let scores = scoreFormat.split(',');        
            for (let score of scores)
            {
                if (score.includes(".."))
                {
                    let scoreSeq = score.split("..")
                    for (let i = scoreSeq[0]; i > scoreSeq[1] - 1 ; i = i - parseInt(scoreStep))
                    {
                        scoreList.push(parseInt(i));
                    }
                }
                else
                {
                    scoreList.push(parseInt(score));
                }
            }
            return scoreList;
        }
    }
    return [0];
}

export async function openTeamsDB() {
    return new Promise((resolve, reject) => {
        const teamsDB = indexedDB.open("teamsDatabase", 1)
        teamsDB.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("teamsDatabase")) {
                console.log("Creating teamsDatabase store")
                const store = db.createObjectStore("teams", {keyPath: "team"});                
            }
        };
        teamsDB.onsuccess = async function(event) {
            const teams = event.target.result;
            console.log("Config Database initialized");
            resolve(teams);
        };
        teamsDB.onerror = function(event) {
            console.log("Config Database failed to open:", event.target.error);
            reject(event.target.error)
        };
    });
}

export const scoreFormats = [
    {
        name: "ZRL",
        fts: "10..1",
        ftsStep: 2,
        ftsBonus: "",
        fal: "20..1",
        falStep: 1,
        falBonus: "",
        fin: "x..1",
        finStep: 1,
        finBonus: "10,8,6,4,2",
        ftsPerEvent: true
    },
    {
        name: "DRS",
        fts: "15,13..5",
        ftsStep: 1,
        ftsBonus: "",
        fal: "10,9,8,8,7,7,6,6,5,5",
        falStep: 1,
        falBonus: "",
        fin: "120,114,108,102,101,100,98,97,96,95,89,88,86,85,84,83,82,80,79,78,72,71,70,68,67,66,65,64,62,61,60,59,58,56,55,54,53,52,50,49,48,47,46,44,43,42,41,40,38,37,30,30,29,29,28,28,26,26,25,25,24,24,23,23,22,22,20,20,19,19,18,18,17,17,16,16,14,14,13,13,12,12,11,11,10,10,8,8,7,7,6,6,5,5,4,4,2,2,2,2",
        finStep: 1,
        finBonus: "",
        ftsPerEvent: false
    }
]

export const sampleNames = [
    { name: "Tadej Pogačar", team: "SLO" },
    { name: "Remco Evenepoel", team: "BEL" },
    { name: "Mathieu van der Poel", team: "NED" },
    { name: "Wout van Aert", team: "BEL" },
    { name: "Jasper Philipsen", team: "Disaster" },
    { name: "Kristen Faulkner", team: "USA" },
    { name: "Allison Jackson", team: "CAN" },
    { name: "Demi Vollering", team: "NED" },
    { name: "Kasia Niewiadoma", team: "POL" },
    { name: "Lotte Kopecky", team: "BEL" },
    { name: "Lionel Sanders", team: "CAN" },
    { name: "Cameron Wurf", team: "AUS" },
    { name: "Kristian Blummenfelt", team: "NOR" },
    { name: "Gustav Iden", team: "NOR" },
    { name: "Marten Van Riel", team: "BEL" },
    { name: "Ashleigh Gentle", team: "AUS" },
    { name: "Taylor Knibb", team: "USA" },
    { name: "Paula Findlay", team: "CAN" },
    { name: "Lucy Charles-Barclay", team: "UK" },
    { name: "Flora Duffy", team: "BER" }
]

export function isTeammate(athlete, teamMatches, watchingTeam, options = { partial: false }) {    
    if (!teamMatches && !watchingTeam) {
        return false;
    }
    const teams = teamMatches?.split(",").map(team => team.trim()).filter(Boolean) || [];
    const teamIds = teams.filter(x => Number.isInteger(Number(x))).map(x => Number(x));
    const negativeTeamIds = teamIds.filter(id => id < 0).map(id => Math.abs(id));
    if (negativeTeamIds.includes(athlete?.athlete.id)) {
        console.log("excluding", athlete.athlete.id)
        return false;
    }
    if (athlete?.athlete.team?.toLowerCase() === watchingTeam?.toLowerCase()) {
        return true;
    }
    //console.log("matching teamIds", teamIds, "teams", teams)
    //console.log(athlete?.athlete.id)
    if (teamIds.includes(athlete?.athlete.id)) {
        return true;
    }
    if (watchingTeam) {
        teams.push(watchingTeam.toLowerCase());
    }
    //console.log("teamMatches", teams)
    let regex;
    if (options.partial) {
        regex = new RegExp(`(${teams.join('|')})`, 'i'); // No \b for partial matches
    } else {
        regex = new RegExp(`\\b(${teams.join('|')})\\b`, 'i'); // \b ensures full word match
    }
    if (teams.length > 0) {
        return regex.test(athlete?.athlete.team?.toLowerCase());
    } else {
        return false;
    }
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}