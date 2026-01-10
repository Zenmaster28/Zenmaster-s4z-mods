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

export async function processRoute(courseId, routeId, laps, distance, includeLoops, showAllArches, disablePenRouting, customRouteData) { 
    distance = parseInt(distance);
    curvePathIndex = 0;   
    routeSegments.length = 0;
    allMarkLines.length = 0;   
    //routeFullData = await common.getRoute(routeId);
    if (includeLoops) {

    } else {
        includeLoops = false;
    }    
    //debugger    
    routeFullData = await getModifiedRoute(routeId, disablePenRouting, customRouteData); 
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
    if (courseId == 14 && allMarkLines.find(x => x.id == "9655158959") && allMarkLines.find(x => x.id == "1034851390")) {
        // rename Ventoux Half KOM to Ventoux KOM when both are present.  As far as I know, this is the only overlapping segment like this.
        const ventouxHalf = allMarkLines.find(x => x.name == "Ventoux Half KOM");
        if (ventouxHalf) {
            ventouxHalf.name = "Ventoux KOM";
        }
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
            let stubSegment = segment.distance < 15 ? true : false; // find short stubby segments that should just be flagged as an arch
            //debugger
            // let showAllArches = true;
            if (zwiftSegmentsRequireStartEnd.includes(segment.id)) {
                if (foundSegmentStart && foundSegmentEnd) {
                    // segment is flagged as requiring the roadSection to go through both the start and end of segment and it does!                    
                    includeSegment = true;                            
                } 
            } else if (stubSegment) {
                includeSegment = false;
            } else if (foundSegmentStart || foundSegmentEnd) {
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

/* no need for this now that it is exported from common
function supplimentPath(worldMeta, curvePath, {physicsSlopeScale}={}) {
    console.log("using zen.supplimentPath")
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
*/

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
    //const supPath = common.supplimentPath || supplimentPath;
    Object.assign(exitRoute, common.supplimentPath(worldMeta, exitRoute.curvePath));
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
    //const supPath = common.supplimentPath || supplimentPath;
    const manifestData = common.supplimentPath(worldMeta, seg);
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

export async function getModifiedRoute(id, disablePenRouting, customRouteData) { 
    let route;
    if (id == 999999999) {
        route = customRouteData
    } else {
        route = await common.rpc.getRoute(id); 
    }        
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
            //console.log("No pen exit route found!")            
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
                let portalRoute = route.hasPortalRoad == 1 ? true : false;
                //let portalRoads;
                //debugger
                if (portalRoute) {
                    console.log("Route uses a climb portal");
                    //const portalManifest = await getPortalManifest(route);
                    //portalRoads = await common.getRoads("portal")
                    //debugger
                }
                console.log(route)
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
                //const supPath = common.supplimentPath || supplimentPath;
                //Object.assign(route, supPath(worldMeta, route.curvePath));
                Object.assign(route, common.supplimentPath(worldMeta, route.curvePath));
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
        //const supPath = common.supplimentPath || supplimentPath;
        Object.assign(segment, common.supplimentPath(worldMeta, segment.curvePath));
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
            //const supPath = common.supplimentPath || supplimentPath;
            Object.assign(route.lapFiller, common.supplimentPath(worldMeta, route.lapFiller.curvePath));
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
        const roadIntersections = intersections.find(int => int.id === first.roadId) || []; 
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
            const nearbyDiff = courseId == 14 ? 0.01 : 0.1; // France oddities...
            nearbySegment = roadSegments.filter(x => x.roadFinish + nearbyDiff > lastManifestEntry.start && x.roadFinish - nearbyDiff < lastManifestEntry.start  && x.reverse == lastManifestEntry.reverse)
            let closestSegment;
            if (nearbySegment.length > 0) {
                closestSegment = nearbySegment.reduce((closest, segment) => {
                    return Math.abs(segment.roadFinish - lastManifestEntry.start) < Math.abs(closest.roadFinish - lastManifestEntry.start) ? segment : closest;
                });
                //debugger
                //console.log("Changing", type, " manifest entry to ", closestSegment.name, "banner.  From", lastManifestEntry.start, "to", addSmallIncrement(closestSegment.roadFinish, -1))
                //debugger
                if (closestSegment.roadFinish < lastManifestEntry.end && lastManifestEntry.reverse == closestSegment.reverse) { // make sure the segment isn't behind the pen and the roads are going in the same direction
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
    //const supPath = common.supplimentPath || supplimentPath;
    const manifestData = common.supplimentPath(worldMeta, seg);
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
        const teamsDB = indexedDB.open("teamsDatabase", 2)
        teamsDB.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("teams")) {
                console.log("Creating teams store")
                const store = db.createObjectStore("teams", {keyPath: "id", autoIncrement: true});
                store.createIndex("team", "team", {unique: false});
                //store.createIndex("badge", {unique: false})
            }
            if (!db.objectStoreNames.contains("athleteIds")) {
                console.log("Creating athleteIds store");
                const store = db.createObjectStore("athleteIds", {keyPath: "athleteId"});
                store.createIndex("team", "team", {unique: false});
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

export async function addNewTeam(dbTeams, teamName) {
    return new Promise((resolve, reject) => {
        const storeName = "teams";
        const transaction = dbTeams.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const newTeam = {
            team: teamName,
            badge: ""
        }
        const request = store.add(newTeam);
        request.onsuccess = function () {            
            console.log("New team added:", teamName);
        };
        request.onerror = function (event) {
            console.error("Failed to add new team:", event.target.error);
        };
        
        transaction.oncomplete = function () {
            //console.log("All segment results processed.");
            resolve();
        };

        transaction.onerror = function (event) {
            console.error("Transaction error:", event.target.error);
            reject(event.target.error);
        };
    });
}
export async function deleteTeam(dbTeams, id) {
    return new Promise((resolve, reject) => {
        const storeName = "teams";
        const transaction = dbTeams.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(parseInt(id));
        request.onsuccess = function () {
            console.log("Deleted team id", id)
        };
        request.onerror = function () {
            console.error("Failed to delete team", id, event.target.error)
        };
        transaction.oncomplete = function () {
            resolve();
        };
        transaction.onerror = function (event) {
            console.error("Transaction error:", event.target.error);
            reject(event.target.error);
        };
    })
}

export async function assignAthlete(dbTeams, id, athleteId) {
    return new Promise((resolve, reject) => {
        const storeName = "athleteIds";
        const transaction = dbTeams.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const assignment = {
            athleteId: athleteId,
            team: id
        }
        let request;
        console.log("assignment", assignment)
        if (id != "-1") {
            request = store.put(assignment);
        } else {
            request = store.delete(athleteId)
        }
        request.onsuccess = function () {            
            console.log("Team assignment complete:", assignment);
        };
        request.onerror = function (event) {
            console.error("Failed to assign athlete to team:", event.target.error);
        };
        
        transaction.oncomplete = function () {
            //console.log("All segment results processed.");
            resolve();
        };

        transaction.onerror = function (event) {
            console.error("Transaction error:", event.target.error);
            reject(event.target.error);
        };
    });
}

export async function getExistingTeams(teamsDb) {
    const storeName = "teams"
    return new Promise((resolve, reject) => {
        try {
            const transaction = teamsDb.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const index = store.index("team");
            //console.log("Starting query for eventSubgroupId:", eventSubgroupId);

            const request = index.getAll();
            request.onsuccess = function () {                
                //console.log("Query success. Retrieved", request.result.length, "entries");
                resolve(request.result);
            };

            request.onerror = function (event) {
                console.error("Error fetching teams", event.target.error);
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
            console.error("Unexpected error in getExistingTeams:", error);
            reject(error);
        }
    });
}

export async function getTeamAssignments(teamsDb) {
    const storeName = "athleteIds"
    return new Promise((resolve, reject) => {
        try {
            const transaction = teamsDb.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const index = store.index("team");
            //console.log("Starting query for eventSubgroupId:", eventSubgroupId);

            const request = index.getAll();
            request.onsuccess = function () {                
                //console.log("Query success. Retrieved", request.result.length, "entries");
                resolve(request.result);
            };

            request.onerror = function (event) {
                console.error("Error fetching athleteids", event.target.error);
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
            console.error("Unexpected error in getTeamAssignments:", error);
            reject(error);
        }
    });
}

export const scoreFormats = [
    {
        name: "ZRL",
        fts: "10..1",
        ftsStep: 2,
        ftsBonus: "",
        fal: "x..1",
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

async function getPortalManifest(route) {
    const intersections = await fetch(`data/worlds/${route.worldId}/roadIntersections.json`).then(response => response.json());
    const decisions = await fetch(`data/worlds/${route.worldId}/routeDecisions.json`).then(response => response.json()).then(routes => routes.find(x => parseInt(x.id) == route.id));
    //route.decisions = decisions;
    let portalRoadIntersections = intersections.filter(x => x.intersections?.some(y => y.forward.find(z => z.option.turnText == "Climb Portal") || y.reverse.find(z => z.option.turnText == "Climb Portal")))
    let portalDecisions = [];
    let portalIntersections = [];
    for (let road of portalRoadIntersections) {
        const roadPortalIntersections = road.intersections.filter(x => x.forward.some(y => y.option.turnText == "Climb Portal") || x.reverse.some(y => y.option.turnText == "Climb Portal"))
        if (roadPortalIntersections.length > 0) {
            portalIntersections = roadPortalIntersections;
            for (let intersection of roadPortalIntersections) {
                const optionForward = intersection.forward.find(x => x.option.turnText == "Climb Portal");
                const optionReverse = intersection.reverse.find(x => x.option.turnText == "Climb Portal");
                const option = optionForward ? optionForward : optionReverse;
                console.log(intersection)
                option.option.markerId = intersection.m_markerId.toString();
                option.option.exitRoad = road.id;
                option.option.exitForward = optionForward ? true : false;
                /*
                let portalIntersection = {
                    markerId : intersection.m_markerId.toString(),
                    forward: option.option.forward ? "1" : "0",
                    turn: option.option.alt == 262 ? "0" : option.option.alt == 263 ? "1" : "3",
                    road: option.option.road
                }
                */
                portalDecisions.push(option.option)
            }
        }        
    }
    const portalDecision = decisions.decisions.find(x => portalDecisions.flatMap(x => x.markerId).includes(x.markerId));
    const decisionIntersection = portalDecisions.find(x => x.markerId == portalDecision.markerId);
    const intersectionManifest = route.manifest.find(x => x.roadId == decisionIntersection.exitRoad && x.reverse != decisionIntersection.exitForward);
    const intersectionManifestIdx = route.manifest.indexOf(intersectionManifest);
    if (intersectionManifest.reverse) {
        intersectionManifest.start = decisionIntersection.exitTime;
    } else {
        intersectionManifest.end = decisionIntersection.exitTime;
    }
    const road1 = await common.getRoad(route.courseId, decisionIntersection.exitRoad)
    const road2 = await common.getRoad(route.courseId, decisionIntersection.road)
    const entryPoint = getNearestPoint(road1, road2, decisionIntersection.exitTime, 5000)
    const nextRoadIntersections = intersections.find(x => x.id == decisionIntersection.road)
    const nextRoadOption = decisionIntersection.forward ? nextRoadIntersections.intersections[0].forward[0].option : nextRoadIntersections.intersections[0].reverse[0].option
    const nextRoad = {
        roadId: decisionIntersection.road,
        reverse: decisionIntersection.forward ? false : true,
        start: decisionIntersection.forward ? entryPoint : nextRoadOption.exitTime,
        end: decisionIntersection.forward ? nextRoadOption.exitTime : entryPoint
    }    
    const road3 = await common.getRoad(route.courseId, decisionIntersection.road)
    const road4 = await common.getRoad(route.courseId, nextRoadOption.road)
    const entryPoint2 = getNearestPoint(road3, road4, nextRoadOption.exitTime, 5000)
    const nextNextRoad = {
        roadId: nextRoadOption.road,
        reverse: nextRoadOption.forward ? false : true,
        start: nextRoadOption.forward ? entryPoint2 : 1,
        end: nextRoadOption.forward ? 1 : entryPoint2
    }
    route.manifest.splice(intersectionManifestIdx + 1, 0, nextRoad);
    route.manifest.splice(intersectionManifestIdx + 2, 0, nextNextRoad)
    const activePortalRoad = await getCurrentPortalRoad(route);
    const portalRoadManifest = {
        roadId: activePortalRoad,
        reverse: false,
        start: 0,
        end: 1,
        portalRoad: true
    }
    const portalRoadManifestDown = {
        roadId: activePortalRoad,
        reverse: true,
        start: 0,
        end: 1,
        portalRoad: true
    }
    route.manifest.splice(intersectionManifestIdx + 3, 0, portalRoadManifest)
    route.manifest.splice(intersectionManifestIdx + 4, 0, portalRoadManifestDown)
    //debugger
    return portalDecisions;
}

async function getCurrentPortalRoad(route) {
    const portalSchedule = await fetch(`data/portalSchedule.json`).then(response => response.json())
    const thisWorldSchedule = portalSchedule.schedule.filter(x => x.world == route.worldId);
    thisWorldSchedule.sort((a, b) => a.startTS - b.startTS);
    let activePortalRoad;
    const now = Date.now();
    for (let i = 1; i < thisWorldSchedule.length; i++) {
        if (thisWorldSchedule[i].startTS >= now && thisWorldSchedule[i - 1].startTS < now) {
            activePortalRoad = thisWorldSchedule[i - 1].road;
        }
    }
    return parseInt(activePortalRoad)
}

export function findTies(segRes, scoreFormat) {
  const results = [];
  let groupStart = 0;
  const propName = scoreFormat == "fal" ? "ts" : "elapsed"

  for (let i = 1; i < segRes.length; i++) {
    if (segRes[i][propName] === segRes[groupStart][propName]) {
      results.push({ idxTie: i, idxTiedWith: groupStart });
    } else {
      groupStart = i;
    }
  }

  return results;
}

export function findPathFromAtoBv5(startPoint, endPoint, intersections, allRoads, courseId, avoidRepackRush, maxDepthOverride) {
    let maxDepth;
    let maxLength;
    if (courseId == 6) {
        //try a bit harder in Watopia
        maxDepth = maxDepthOverride || 8;
        maxLength = 30000;
    } else {
        maxDepth = maxDepthOverride || 6;
        maxLength = 20000
    }
    
    const t = Date.now();
    const targetRoad = endPoint.roadId;
    const targetRP = endPoint.rp;
    const startRoad = startPoint.roadId;
    const startDirection = !startPoint.reverse;
    let startRP = startPoint.rp
    let sameRoad = false;
    let shortestPathSoFar = Infinity;
    let thisPathSoFar = 0;
    let repeatIntersections = 0;
    let stats = {};
    //const allRoads = await common.getRoads(courseId);
    if (startPoint.roadId == endPoint.roadId) {
        const roadInfo = allRoads.find(x => x.id == startPoint.roadId)
        if (roadInfo.looped) {
            //debugger
            sameRoad = true;
        } else if (startPoint.reverse && startPoint.rp > endPoint.rp) {
            //debugger
            sameRoad = true;
        } else if (!startPoint.reverse && startPoint.rp < endPoint.rp) {
            //debugger
            sameRoad = true;
        }
        //debugger
    }
    //console.log("maxDepth", maxDepth)
    //let startPath = [];
    let path = [];
    let allPaths = [];
    let found = false;
    let leastHops = Infinity;
    let pathsTooLong = 0;
    let tooManyHops = 0;
    let pathsOver25k = 0;
    let timeSpentMeasuring = 0;
    function explore(roadId, forward, depth, currentPath, thisPathSoFar) {
        //console.log("exploring", roadId)
        //console.log("currentPath", currentPath)
        if (roadId == 250) {
            //debugger
        }
        const l = Date.now();        
        /*
        for (let section of currentPath) {            
            const sectionLength = measureRoadSectionV2(section, courseId, allRoads);
            thisPathSoFar += sectionLength;
            //console.log("Current path length is ", thisPathSoFar, "shortest path so far is", shortestPathSoFar)
        }
        timeSpentMeasuring += Date.now() - l;
        */
        //const l = Date.now();
        if (courseId == 6 && avoidRepackRush && (roadId == 97 || roadId == 137) && targetRoad != 135) {
            //don't go into Repack Rush unless explicitly clicking on the road for it
            return;
        }
        const lastSectionLength = measureRoadSectionV2(currentPath.at(-1), courseId, allRoads)
        timeSpentMeasuring += Date.now() - l;
        thisPathSoFar += lastSectionLength;
        //debugger
        if (thisPathSoFar > shortestPathSoFar) {
            // this path is longer than a previously found one, abandon it
            //console.log(`This path is longer ${thisPathSoFar} than a previously found shorter one ${shortestPathSoFar}, abandoning it`)
            pathsTooLong++;
            //thisPathSoFar = 0;
            return;
        }
        if (thisPathSoFar > maxLength) {
            // path is more than 25k, abandon it
            pathsOver25k++;
            //thisPathSoFar = 0;
            return;
        }
        if (!allRoads.find(x => x.id == roadId)) {
            //console.log("Found a roadId that Sauce doesn't know about, ignoring roadId", roadId)
            return
        }
        if (depth > maxDepth) {
            //console.log("max depth exceeded")
            //thisPathSoFar = 0;
            return;
        } 
        if (timeSpentMeasuring > 20000) {
            return;
        }
        const maxPaths = 1000
        if (allPaths.length > maxPaths) {
            console.log("Found more than", maxPaths, "paths, that's enough for now.")
            return;
        }
        if (currentPath.some(pathEntry => pathEntry.roadId === roadId && pathEntry.forward === forward)) {
            //we've already been here, don't record it again
            //console.log("We've gone full circle back to an road we were on before...",currentPath, roadId, forward)
            //debugger
            // **** Maybe revisit this...
            //return;
        }
        if (currentPath.length > leastHops + 2) {
            //console.log("This path is 2 more hops than the lowest count, skip the rest")
            //debugger
            // consider doing this by measuing the length on the fly
            tooManyHops++;
            return;
        }        
        const rd1 = allRoads.find(x => x.id == currentPath.at(-1).roadId)
        const rd2 = allRoads.find(x => x.id == roadId)                     
        let entryTime = getNearestPoint(rd1, rd2, currentPath.at(-1).exitTime, 1000) 
        const nextIntEnd = roadId == targetRoad ? targetRP : forward ? 1 : 0
        //const nextIntersection = getNextIntersection(roadId, forward, entryTime, targetRP, allRoads, intersections)
        const nextIntersection = getNextIntersection(roadId, forward, entryTime, nextIntEnd, allRoads, intersections)
        if (roadId == 250) {
            //debugger
            //we are entering beyond the targetRp - set some safe road 5 boundaries!
        }
        //NEED to deal with a looped road properly, especially if the target is before the next intersection
        //if (roadId == targetRoad && nextIntersection.length == 0) {
        if (roadId == targetRoad) { 
            //console.log("Found the target road")           
            let usePath = false;
            let useIntersection = false;
            const targetRoadData = allRoads.find(x => x.id == roadId)
            if (targetRoadData.looped) {
                //console.log(`Target is looped, entryTime: ${entryTime}, targetRP: ${targetRP}`, "nextIntersection:", nextIntersection )
                
                // ********** TODO - fix getting onto volcano cirsuit forward from 21

                if ((forward && entryTime > nextIntersection.m_roadTime1) && (nextIntersection.m_roadTime1 > targetRP)) {
                    //looped road and we have to cross the 0/1 line going forward and the targetRP is before the next intersection
                } else if ((!forward && entryTime < nextIntersection.m_roadTime1) && nextIntersection.m_roadTime1 < targetRP) {
                    //looped road and we have to cross the 0/1 line going reverse and the targetRP is before the next intersection
                    //debugger
                } else if (!forward && entryTime > targetRP) {
                } else if (!forward && entryTime > targetRP && entryTime > nextIntersection.m_roadTime2) {
                    //looped road in reverse and we find the targetRP before the next intersection
                } else if (forward && entryTime < targetRP && (targetRP <= nextIntersection.m_roadTime1 || entryTime >= nextIntersection.m_roadTime2)) {
                    //looped road forward and we find the targetRP before the next intersection 
                    //debugger
                } else if (courseId == 6 && avoidRepackRush && targetRoad != 135 && roadId == 81 && 
                        (nextIntersection.forward.find(x => x.option.road == 137) ||
                        nextIntersection.reverse.find(x => x.option.road == 97)) )
                {
                    //don't go into Repack Rush unless explicitly clicking on the road for it
                    
                } else {                    
                    //useIntersection = true;
                }
                //console.log("useIntersection", useIntersection)
            }  
            
            if (!useIntersection) {
                if (forward && targetRP < entryTime) {
                    if (targetRoadData.looped) {
                        currentPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: entryTime,
                            exitTime: 1
                        },{
                            roadId: roadId,
                            forward: forward,
                            entryTime: 0,
                            exitTime: targetRP
                        });
                        //debugger
                        usePath = true;
                    } else {
                        // entered the target road beyond the target and it's not a looped road
                        usePath = false;
                    }
                } else if (!forward && targetRP > entryTime) {
                    if (targetRoadData.looped) {
                        currentPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: entryTime,
                            exitTime: 0
                        },{
                            roadId: roadId,
                            forward: forward,
                            entryTime: 1,
                            exitTime: targetRP
                        });
                        usePath = true;
                    } else {
                        // entered the target road beyond the target and it's not a looped road
                        usePath = false;
                    }
                } else {  
                    //get any passed intersections between entryTime and targetRP
                    const passedIntersections = getPassedIntersections(roadId, forward, entryTime, targetRP, intersections, allRoads)
                    
                    currentPath.push({
                        roadId: roadId,
                        forward: forward,
                        entryTime: entryTime,
                        exitTime: targetRP,
                        passedIntersections: passedIntersections
                    });
                    usePath = true;
                }
                if (usePath) {
                    if (currentPath.length < leastHops) {
                        leastHops = currentPath.length;
                    }
                    const validPath = JSON.parse(JSON.stringify(currentPath)) // not sure I need to do this but...
                    allPaths.push(validPath)
                    
                    let validPathLength = 0;
                    //let m = Date.now()
                    
                    for (let section of validPath) {                        
                        const sectionLength = measureRoadSectionV2(section, courseId, allRoads);
                        validPathLength += sectionLength;
                        //console.log("Current path length is ", validPathLength)
                    }
                    
                    //timeSpentMeasuring += Date.now() - m;
                    //const lastSectionLength = measureRoadSectionV2(currentPath.at(-1), courseId, allRoads)
                    
                    //thisPathSoFar += lastSectionLength;
                    //console.log("Found a valid path", validPath, " of length ", validPathLength, "thisPathSoFar", thisPathSoFar)
                    if (validPathLength < shortestPathSoFar) {
                        shortestPathSoFar = validPathLength;
                    }
                }
                  
                return;
            }
            

        } else if (roadId == targetRoad && forward) {
            //debugger
        }
        const thisRoadData = allRoads.find(x => x.id == roadId)
        const thisRoadIntersections = intersections.find(int => int.id === roadId)
        if (!thisRoadIntersections.intersections) {
            //we hit a dead end
            return;
        }
        
        let directionIntersections = [];
        let validDirectionIntersections = [];
        if (forward) {
            directionIntersections = thisRoadIntersections.intersections.filter(int => int.forward.some(x => Object.keys(x).length > 0));
            if (thisRoadData.looped) {
                
                validDirectionIntersections = directionIntersections.sort((a, b) => {
                    const aAbove = a.m_roadTime2 > entryTime;
                    const bAbove = b.m_roadTime2 > entryTime;
                  
                    // Sort by grouping first (above vs below entryTime)
                    if (aAbove !== bAbove) {
                      return aAbove ? -1 : 1;
                    }
                  
                    // Then sort within each group by m_roadTime2 in ascending order
                    return a.m_roadTime2 - b.m_roadTime2;
                  });
                
            } else {
                
                validDirectionIntersections = directionIntersections.filter(x => Math.max(x.m_roadTime2, x.m_roadTime1) > entryTime)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime2 > b.m_roadTime2;
                })
            }            
        } else {
            directionIntersections = thisRoadIntersections.intersections.filter(int => int.reverse.some(x => Object.keys(x).length > 0));
            if (thisRoadData.looped) {
                validDirectionIntersections = directionIntersections.sort((a,b) => {
                    const aLess = a.m_roadTime1 < entryTime;
                    const bLess = b.m_roadTime1 < entryTime;
                    if (aLess && !bLess) return -1;
                    if (!aLess && bLess) return 1;
                    return a.m_roadTime1 < b.m_roadTime1;
                });
            } else {                
                validDirectionIntersections = directionIntersections.filter(x => Math.min(x.m_roadTime1, x.m_roadTime2) < entryTime)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime1 < b.m_roadTime1;
                })
            }
        }
        
        
        let depthInc = 1;
        if (validDirectionIntersections.length == 1) {
            // this is road with a single intersection, don't count it in the depth.
            depthInc = 0;
        }        
        for (let int in validDirectionIntersections) {
            if (currentPath.some(pathEntry => pathEntry.intersection?.m_markerId === validDirectionIntersections[int].m_markerId))
            {
                //console.log("We've been to this intersection already", intersection)
                return; // we've been to this intersection already so we went in a circle - abandon the path
            }            
            if (forward) {                
                for (let option of validDirectionIntersections[int].forward) {
                    let nextPath = [...currentPath]
                    
                    if (option.option) {
                        //debugger
                        
                        if (option.option.road == roadId) {
                            //don't care about options that stay on the road.
                            continue;
                        }
                        if (nextPath.length > 20) {
                            //debugger
                        }
                        if (nextPath.find(x => x.intersection?.m_markerId == validDirectionIntersections[int].m_markerId)) {
                            //we've been here before...
                            repeatIntersections ++;
                            //debugger
                        }
                        let lineCrossed = false;
                        if (entryTime > option.option.exitTime) {
                            // crossed the 0/1 line
                            nextPath.push({
                                roadId: roadId,
                                forward: forward,
                                entryTime: entryTime,
                                exitTime: 1
                            });
                            lineCrossed = true;
                        }
                        nextPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: lineCrossed ? 0 : entryTime,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        });
                        
                        
                        explore(option.option.road, option.option.forward, depth + depthInc, nextPath, thisPathSoFar)
                    }
                }
            } else {                      
                for (let option of validDirectionIntersections[int].reverse) {
                    //debugger                    
                    let nextPath = [...currentPath]
                    if (option.option) {   
                        
                        if (option.option.road == roadId) {
                            //don't care about options that stay on the road.
                            continue;
                        }
                        if (nextPath.find(x => x.intersection?.m_markerId == validDirectionIntersections[int].m_markerId)) {
                            //we've been here before...
                            repeatIntersections++;
                            //debugger
                        }
                        let lineCrossed = false;
                        if (entryTime < option.option.exitTime) {
                            // crossed the 0/1 line
                            nextPath.push({
                                roadId: roadId,
                                forward: forward,
                                entryTime: entryTime,
                                exitTime: 0
                            });
                            lineCrossed = true;
                        } 
                        nextPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: lineCrossed ? 1 : entryTime,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        });
                        
                        explore(option.option.road, option.option.forward, depth + depthInc, nextPath, thisPathSoFar)
                    }
                }
            }
        }
    } 
    let shortestDistance = Infinity 
    if (!sameRoad)  {
        const startRoadData = allRoads.find(x => x.id == startRoad)
        const roadIntersections = intersections.find(int => int.id === startRoad);
        let directionIntersections = [];
        let validDirectionIntersections = [];
        if (startDirection) {
            directionIntersections = roadIntersections.intersections.filter(intersection => intersection.forward.some(item => Object.keys(item).length > 0));
            if (startRoadData.looped) {            
                validDirectionIntersections = directionIntersections.sort((a,b) => {
                    const aGreater = a.m_roadTime1 > startRP;
                    const bGreater = b.m_roadTime1 > startRP;
                    if (aGreater && !bGreater) return -1;
                    if (!aGreater && bGreater) return 1;
                    return a.m_roadTime1 > b.m_roadTime1;
                });
            } else {
                validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime2 > startRP)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime2 > b.m_roadTime2
                })
            }
        } else {
            directionIntersections = roadIntersections.intersections.filter(intersection => intersection.reverse.some(item => Object.keys(item).length > 0));
            if (startRoadData.looped) {            
                validDirectionIntersections = directionIntersections.sort((a,b) => {
                    const aLess = a.m_roadTime1 < startRP;
                    const bLess = b.m_roadTime1 < startRP;
                    if (aLess && !bLess) return -1;
                    if (!aLess && bLess) return 1;
                    return a.m_roadTime1 < b.m_roadTime1;
                });
            } else {
                validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime1 < startRP)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime1 < b.m_roadTime1
                })
            }
        }
        if (startRoad == 1) {
            //debugger
        }
        //debugger
        //for (let intersection of validDirectionIntersections) {
        for (let int in validDirectionIntersections) {
            if (startDirection) {
                for (let option of validDirectionIntersections[int].forward) {
                    let startPath = [];
                    //TODO - check if crossing 0/1 line
                    
                    if (option.option) {
                        if (option.option.road == startRoad) {
                            continue
                        }
                        //TODO - make sure this is a known road (ie. not a running road)
                        let lineCrossed = false;
                        if (startRP > option.option.exitTime) {
                            // we have to cross the 0/1 line to get to this intersection
                            startPath.push({
                                roadId: startRoad,
                                forward: startDirection,
                                entryTime: startRP,
                                exitTime: 1
                            });
                            lineCrossed = true;
                        }
                        //debugger
                        startPath.push({
                            roadId: startRoad,
                            forward: startDirection,
                            entryTime: lineCrossed ? 0 : startRP,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        })
                        
                        explore(option.option.road, option.option.forward, 0, startPath, thisPathSoFar)
                    }
                    //debugger
                }
            } else {
                for (let option of validDirectionIntersections[int].reverse) {
                    let startPath = [];
                    //TODO - check if crossing 0/1 line
                    if (option.option) {
                        
                        if (option.option.road == startRoad) {
                            continue
                        }
                        //debugger
                        let lineCrossed = false;
                        if (startRP < option.option.exitTime) {
                            // we have to cross the 0/1 line to get to this intersection
                            startPath.push({
                                roadId: startRoad,
                                forward: startDirection,
                                entryTime: startRP,
                                exitTime: 0
                            });
                            lineCrossed = true;
                        }
                        startPath.push({
                            roadId: startRoad,
                            forward: startDirection,
                            entryTime: lineCrossed ? 1 : startRP,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        })
                        //debugger
                        
                        explore(option.option.road, option.option.forward, 0, startPath, thisPathSoFar)
                    }
                    //debugger
                    
                }
            }
            
        }
        //debugger
        shortestDistance = Infinity;
        //console.log("allPaths", allPaths)
        //console.log("Least number of hops", leastHops)
        //debugger
        const s = Date.now();
        for (let thisPath of allPaths) {
            if (thisPath.find(x => x.intersection?.m_markerId == 1190003)) {
                console.log("Ignoring path with m_markerId 1190003")
                continue;
            }
            let pathLength = 0;
            for (let section of thisPath) {
                const thisLength = measureRoadSectionV2(section, courseId, allRoads);
                if (isNaN(thisLength)) {
                    console.log("Length is NaN!", section)
                } else {
                    pathLength += thisLength
                }
            }
            if (pathLength < shortestDistance) {
                shortestDistance = pathLength;
                path = thisPath;
            }
        }
        //path = allPaths[2]
        //console.log(`Found the shortest path in ${Date.now() - s}ms`)
        const timeSpentFindingPaths = Date.now() - t;
        //console.log(`Found ${allPaths.length} possible paths in ${Date.now() - t}ms.  The shortest one was ${shortestDistance}`)
        //console.log(`Encountered ${repeatIntersections} repeated intersections`)
        //console.log(`Abandoned ${pathsTooLong} for being longer than a previously found path`)
        //console.log(`Abandoned ${tooManyHops} for too many hops`)
        //console.log(`Abandoned ${pathsOver25k} paths exceeding ${maxLength / 1000}k`)
        //console.log(`Spent ${timeSpentMeasuring}ms measuring validPaths`)
        if (!stats.init) {
            stats.allPaths = allPaths.length,
            stats.shortestDistance = shortestDistance,
            stats.pathsTooLong = pathsTooLong,
            stats.tooManyHops = tooManyHops,
            stats.exceedMaxLength = pathsOver25k,
            stats.timeSpentMeasuring = timeSpentMeasuring,
            stats.timeSpentFindingPaths = timeSpentFindingPaths,
            stats.init = true
            //console.log("Recorded stats", stats)
        }
        /*
        if (showDebugStats) {
            const debugStatsDiv = document.getElementById("debugStats");
            debugStatsDiv.innerHTML = "";
            let output = `Found ${allPaths.length} possible paths in ${Date.now() - t}ms.<br>The shortest one was ${parseInt(shortestDistance)}m<br>`            
            output += "Abandoned:<br>"
            output += `- ${pathsTooLong} longer than a previous path<br>`
            output += `- ${tooManyHops} for too many hops<br>`
            output += `- ${pathsOver25k} paths exceeding ${maxLength / 1000}k<br>`
            output += `Spent ${timeSpentMeasuring}ms measuring validPaths`
            debugStatsDiv.innerHTML = output;
        }
        */
        //debugger
    } else {
        //debugger
        console.log("Target road is the same as the start road", startPoint, endPoint, startDirection)
        const roadData = allRoads.find(x => x.id == startPoint.roadId)
        if (roadData.looped) {
                if (startDirection) {
                    if (startPoint.rp > endPoint.rp) {
                        // crossed the 0/1 line
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: 1,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, 1, intersections, allRoads)
                        },
                        {
                            entryTime: 0,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, 0, endPoint.rp, intersections, allRoads)
                        })
                    } else {
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, endPoint.rp, intersections, allRoads)
                        })
                    }
                } else {
                    if (startPoint.rp < endPoint.rp) {
                        // crossed the 0/1 line
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: 0,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, 0, intersections, allRoads)
                        },
                        {
                            entryTime: 1,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, 1, endPoint.rp, intersections, allRoads)
                        })
                    } else {
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, endPoint.rp, intersections, allRoads)
                        })
                    }
                }
        } else {            
            path.push({
                entryTime: startPoint.rp,
                exitTime: endPoint.rp,
                forward: startDirection,
                roadId: startPoint.roadId,
                passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, endPoint.rp, intersections, allRoads)
            })
        }
    }
    //debugger
    let bestPath = {};
    if (path) {
        found = true;
        bestPath.path = path;
        bestPath.distance = shortestDistance;
        bestPath.manifest = [];
        path.forEach(road => {
            const m = {
                start: road.forward ? road.entryTime : road.exitTime,
                end: road.forward ? road.exitTime : road.entryTime,
                reverse: !road.forward,
                roadId: road.roadId
            }
            if (m.start > m.end) {
                debugger
            }
            bestPath.manifest.push(m);
        })
    }
    //const bestPathIntersections = await getManifestIntersections(bestPath.manifest, courseId)
    //bestPath.testIntersections = bestPathIntersections;
    //console.log("bestPathIntersections", bestPathIntersections)
    if (found) {
        return {
            bestPath: bestPath,
            stats: stats, 
            allPaths: allPaths
        }
    } else {
        return {
            bestPath: null,
            stats: stats
        }
    }
    //return found ? bestPath : null;

}
export function findPathFromAtoBv6(startPoint, endPoint, intersections, allRoads, courseId, avoidRepackRush, maxDepthOverride) {
    let maxDepth;
    let maxLength;
    if (courseId == 6) {
        //try a bit harder in Watopia
        maxDepth = maxDepthOverride || 8;
        maxLength = 30000;
    } else {
        maxDepth = maxDepthOverride || 6;
        maxLength = 20000
    }
    
    const t = Date.now();
    const targetRoad = endPoint.roadId;
    const targetRP = endPoint.rp;
    const startRoad = startPoint.roadId;
    const startDirection = !startPoint.reverse;
    let startRP = startPoint.rp
    let sameRoad = false;
    let shortestPathSoFar = Infinity;
    let thisPathSoFar = 0;
    let repeatIntersections = 0;
    let stats = {};
    //const allRoads = await common.getRoads(courseId);
    if (startPoint.roadId == endPoint.roadId) {
        const roadInfo = allRoads.find(x => x.id == startPoint.roadId)
        if (roadInfo.looped) {
            //debugger
            sameRoad = true;
        } else if (startPoint.reverse && startPoint.rp > endPoint.rp) {
            //debugger
            if (endPoint.reverse == true || !('reverse' in endPoint)) {
                sameRoad = true;
            }
        } else if (!startPoint.reverse && startPoint.rp < endPoint.rp) {
            //debugger
            if (endPoint.reverse == false || !('reverse' in endPoint)) {
                sameRoad = true;
            }
        }
        //debugger
    }
    //console.log("maxDepth", maxDepth)
    //let startPath = [];
    let path = [];
    let allPaths = [];
    let found = false;
    let leastHops = Infinity;
    let pathsTooLong = 0;
    let tooManyHops = 0;
    let pathsOver25k = 0;
    let timeSpentMeasuring = 0;
    function explore(roadId, forward, depth, currentPath, thisPathSoFar) {
        //console.log("exploring", roadId)
        //console.log("currentPath", currentPath)
        if (roadId == 250) {
            //debugger
        }
        const l = Date.now();        
        /*
        for (let section of currentPath) {            
            const sectionLength = measureRoadSectionV2(section, courseId, allRoads);
            thisPathSoFar += sectionLength;
            //console.log("Current path length is ", thisPathSoFar, "shortest path so far is", shortestPathSoFar)
        }
        timeSpentMeasuring += Date.now() - l;
        */
        //const l = Date.now();
        if (courseId == 6 && avoidRepackRush && (roadId == 97 || roadId == 137) && targetRoad != 135) {
            //don't go into Repack Rush unless explicitly clicking on the road for it
            return;
        }
        const lastSectionLength = measureRoadSectionV2(currentPath.at(-1), courseId, allRoads)
        timeSpentMeasuring += Date.now() - l;
        thisPathSoFar += lastSectionLength;
        //debugger
        if (thisPathSoFar > shortestPathSoFar) {
            // this path is longer than a previously found one, abandon it
            //console.log(`This path is longer ${thisPathSoFar} than a previously found shorter one ${shortestPathSoFar}, abandoning it`)
            pathsTooLong++;
            //thisPathSoFar = 0;
            return;
        }
        if (thisPathSoFar > maxLength) {
            // path is more than 25k, abandon it
            pathsOver25k++;
            //thisPathSoFar = 0;
            return;
        }
        if (!allRoads.find(x => x.id == roadId)) {
            //console.log("Found a roadId that Sauce doesn't know about, ignoring roadId", roadId)
            return
        }
        if (depth > maxDepth) {
            //console.log("max depth exceeded")
            //thisPathSoFar = 0;
            return;
        } 
        if (timeSpentMeasuring > 20000) {
            return;
        }
        const maxPaths = 1000
        if (allPaths.length > maxPaths) {
            console.log("Found more than", maxPaths, "paths, that's enough for now.")
            return;
        }
        if (currentPath.some(pathEntry => pathEntry.roadId === roadId && pathEntry.forward === forward)) {
            //we've already been here, don't record it again
            //console.log("We've gone full circle back to an road we were on before...",currentPath, roadId, forward)
            //debugger
            // **** Maybe revisit this...
            //return;
        }
        if (currentPath.length > leastHops + 2) {
            //console.log("This path is 2 more hops than the lowest count, skip the rest")
            //debugger
            // consider doing this by measuing the length on the fly
            tooManyHops++;
            return;
        }        
        const rd1 = allRoads.find(x => x.id == currentPath.at(-1).roadId)
        const rd2 = allRoads.find(x => x.id == roadId)                     
        let entryTime = getNearestPoint(rd1, rd2, currentPath.at(-1).exitTime, 10000) 
        const nextIntEnd = roadId == targetRoad ? targetRP : forward ? 1 : 0
        //const nextIntersection = getNextIntersection(roadId, forward, entryTime, targetRP, allRoads, intersections)
        const nextIntersection = getNextIntersection(roadId, forward, entryTime, nextIntEnd, allRoads, intersections)
        if (roadId == 0 && forward) {
            //debugger
            //we are entering beyond the targetRp - set some safe road 5 boundaries!
        }
        //NEED to deal with a looped road properly, especially if the target is before the next intersection
        //if (roadId == targetRoad && nextIntersection.length == 0) {
        if (roadId == targetRoad) { 
            //console.log("Found the target road")           
            let usePath = false;
            let useIntersection = false;
            const targetRoadData = allRoads.find(x => x.id == roadId)
            if (targetRoadData.looped) {
                //console.log(`Target is looped, entryTime: ${entryTime}, targetRP: ${targetRP}`, "nextIntersection:", nextIntersection )
                
                // ********** TODO - fix getting onto volcano cirsuit forward from 21

                if ((forward && entryTime > nextIntersection.m_roadTime1) && (nextIntersection.m_roadTime1 > targetRP)) {
                    //looped road and we have to cross the 0/1 line going forward and the targetRP is before the next intersection
                } else if ((!forward && entryTime < nextIntersection.m_roadTime1) && nextIntersection.m_roadTime1 < targetRP) {
                    //looped road and we have to cross the 0/1 line going reverse and the targetRP is before the next intersection
                    //debugger
                } else if (!forward && entryTime > targetRP) {
                } else if (!forward && entryTime > targetRP && entryTime > nextIntersection.m_roadTime2) {
                    //looped road in reverse and we find the targetRP before the next intersection
                } else if (forward && entryTime < targetRP && (targetRP <= nextIntersection.m_roadTime1 || entryTime >= nextIntersection.m_roadTime2)) {
                    //looped road forward and we find the targetRP before the next intersection 
                    //debugger
                } else if (courseId == 6 && avoidRepackRush && targetRoad != 135 && roadId == 81 && 
                        (nextIntersection.forward.find(x => x.option.road == 137) ||
                        nextIntersection.reverse.find(x => x.option.road == 97)) )
                {
                    //don't go into Repack Rush unless explicitly clicking on the road for it
                    
                } else {                    
                    //useIntersection = true;
                }
                //console.log("useIntersection", useIntersection)
            }  
            
            if (!useIntersection) {
                if (forward && targetRP < entryTime) {
                    if (targetRoadData.looped) {
                        currentPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: entryTime,
                            exitTime: 1
                        },{
                            roadId: roadId,
                            forward: forward,
                            entryTime: 0,
                            exitTime: targetRP
                        });
                        //debugger
                        usePath = true;
                    } else {
                        // entered the target road beyond the target and it's not a looped road, are we close enough?
                        const testProximity = targetRoadData.curvePath.distanceBetweenRoadPercents(targetRP, entryTime, 4e-2) / 100;
                        if (testProximity <= 50) {
                            console.warn(`Entered the target road beyong the targetRp but within 50m (${testProximity}) - using it anyway`)
                            currentPath.push({
                                roadId: roadId,
                                forward: forward,
                                entryTime: entryTime,
                                exitTime: entryTime + 1e-10,
                                passedIntersections: []
                            });
                            usePath = true;
                        } else {
                            console.warn(`Entered the target road beyong the targetRp and beyond 50m (${testProximity}) - abandoning path`)
                            usePath = false;
                        }
                    }
                } else if (!forward && targetRP > entryTime) {
                    if (targetRoadData.looped) {
                        currentPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: entryTime,
                            exitTime: 0
                        },{
                            roadId: roadId,
                            forward: forward,
                            entryTime: 1,
                            exitTime: targetRP
                        });
                        usePath = true;
                    } else {
                        // entered the target road beyond the target and it's not a looped road, are we close enough?
                        const testProximity = targetRoadData.curvePath.distanceBetweenRoadPercents(entryTime, targetRP, 4e-2) / 100;
                        if (testProximity <= 50) {
                            console.warn(`Entered the target road beyong the targetRp but within 50m (${testProximity}) - using it anyway`)
                            currentPath.push({
                                roadId: roadId,
                                forward: forward,
                                entryTime: entryTime,
                                exitTime: entryTime - 1e-10,
                                passedIntersections: []
                            });
                            usePath = true;
                        } else {
                            console.warn(`Entered the target road beyong the targetRp and beyond 50m (${testProximity}) - abandoning path`)
                            usePath = false;
                        }
                    }
                } else {  
                    //get any passed intersections between entryTime and targetRP
                    const passedIntersections = getPassedIntersections(roadId, forward, entryTime, targetRP, intersections, allRoads)
                    
                    currentPath.push({
                        roadId: roadId,
                        forward: forward,
                        entryTime: entryTime,
                        exitTime: targetRP,
                        passedIntersections: passedIntersections
                    });
                    usePath = true;
                }
                if (usePath) {
                    if (currentPath.length < leastHops) {
                        leastHops = currentPath.length;
                    }
                    const validPath = JSON.parse(JSON.stringify(currentPath)) // not sure I need to do this but...
                    allPaths.push(validPath)
                    
                    let validPathLength = 0;
                    //let m = Date.now()
                    
                    for (let section of validPath) {                        
                        const sectionLength = measureRoadSectionV2(section, courseId, allRoads);
                        validPathLength += sectionLength;
                        //console.log("Current path length is ", validPathLength)
                    }
                    
                    //timeSpentMeasuring += Date.now() - m;
                    //const lastSectionLength = measureRoadSectionV2(currentPath.at(-1), courseId, allRoads)
                    
                    //thisPathSoFar += lastSectionLength;
                    //console.log("Found a valid path", validPath, " of length ", validPathLength, "thisPathSoFar", thisPathSoFar)
                    if (validPathLength < shortestPathSoFar) {
                        shortestPathSoFar = validPathLength;
                    }
                }
                  
                return;
            }
            

        } else if (roadId == targetRoad && forward) {
            //debugger
        }
        const thisRoadData = allRoads.find(x => x.id == roadId)
        const thisRoadIntersections = intersections.find(int => int.id === roadId)
        if (!thisRoadIntersections.intersections) {
            //we hit a dead end
            return;
        }
        
        let directionIntersections = [];
        let validDirectionIntersections = [];
        if (forward) {
            directionIntersections = thisRoadIntersections.intersections.filter(int => int.forward.some(x => Object.keys(x).length > 0));
            if (thisRoadData.looped) {
                
                validDirectionIntersections = directionIntersections.sort((a, b) => {
                    const aAbove = a.m_roadTime2 > entryTime;
                    const bAbove = b.m_roadTime2 > entryTime;
                  
                    // Sort by grouping first (above vs below entryTime)
                    if (aAbove !== bAbove) {
                      return aAbove ? -1 : 1;
                    }
                  
                    // Then sort within each group by m_roadTime2 in ascending order
                    return a.m_roadTime2 - b.m_roadTime2;
                  });
                
            } else {
                
                validDirectionIntersections = directionIntersections.filter(x => Math.max(x.m_roadTime2, x.m_roadTime1) > entryTime)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime2 > b.m_roadTime2;
                })
            }            
        } else {
            directionIntersections = thisRoadIntersections.intersections.filter(int => int.reverse.some(x => Object.keys(x).length > 0));
            if (thisRoadData.looped) {
                validDirectionIntersections = directionIntersections.sort((a,b) => {
                    const aLess = a.m_roadTime1 < entryTime;
                    const bLess = b.m_roadTime1 < entryTime;
                    if (aLess && !bLess) return -1;
                    if (!aLess && bLess) return 1;
                    return a.m_roadTime1 < b.m_roadTime1;
                });
            } else {                
                validDirectionIntersections = directionIntersections.filter(x => Math.min(x.m_roadTime1, x.m_roadTime2) < entryTime)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime1 < b.m_roadTime1;
                })
            }
        }
        
        
        let depthInc = 1;
        if (validDirectionIntersections.length == 1) {
            // this is road with a single intersection, don't count it in the depth.
            depthInc = 0;
        }        
        for (let int in validDirectionIntersections) {
            if (currentPath.some(pathEntry => pathEntry.intersection?.m_markerId === validDirectionIntersections[int].m_markerId))
            {
                //console.log("We've been to this intersection already", intersection)
                return; // we've been to this intersection already so we went in a circle - abandon the path
            }            
            if (forward) {                
                for (let option of validDirectionIntersections[int].forward) {
                    let nextPath = [...currentPath]
                    
                    if (option.option) {
                        //debugger
                        
                        if (option.option.road == roadId) {
                            //don't care about options that stay on the road.
                            continue;
                        }
                        if (nextPath.length > 20) {
                            //debugger
                        }
                        if (nextPath.find(x => x.intersection?.m_markerId == validDirectionIntersections[int].m_markerId)) {
                            //we've been here before...
                            repeatIntersections ++;
                            //debugger
                        }
                        let lineCrossed = false;
                        if (entryTime > option.option.exitTime) {
                            // crossed the 0/1 line
                            nextPath.push({
                                roadId: roadId,
                                forward: forward,
                                entryTime: entryTime,
                                exitTime: 1
                            });
                            lineCrossed = true;
                        }
                        nextPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: lineCrossed ? 0 : entryTime,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        });
                        
                        
                        explore(option.option.road, option.option.forward, depth + depthInc, nextPath, thisPathSoFar)
                    }
                }
            } else {                      
                for (let option of validDirectionIntersections[int].reverse) {
                    //debugger                    
                    let nextPath = [...currentPath]
                    if (option.option) {   
                        
                        if (option.option.road == roadId) {
                            //don't care about options that stay on the road.
                            continue;
                        }
                        if (nextPath.find(x => x.intersection?.m_markerId == validDirectionIntersections[int].m_markerId)) {
                            //we've been here before...
                            repeatIntersections++;
                            //debugger
                        }
                        let lineCrossed = false;
                        if (entryTime < option.option.exitTime) {
                            // crossed the 0/1 line
                            nextPath.push({
                                roadId: roadId,
                                forward: forward,
                                entryTime: entryTime,
                                exitTime: 0
                            });
                            lineCrossed = true;
                        } 
                        nextPath.push({
                            roadId: roadId,
                            forward: forward,
                            entryTime: lineCrossed ? 1 : entryTime,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        });
                        
                        explore(option.option.road, option.option.forward, depth + depthInc, nextPath, thisPathSoFar)
                    }
                }
            }
        }
    } 
    let shortestDistance = Infinity 
    if (!sameRoad)  {
        const startRoadData = allRoads.find(x => x.id == startRoad)
        const roadIntersections = intersections.find(int => int.id === startRoad);
        let directionIntersections = [];
        let validDirectionIntersections = [];
        if (startDirection) {
            directionIntersections = roadIntersections.intersections.filter(intersection => intersection.forward.some(item => Object.keys(item).length > 0));
            if (startRoadData.looped) {            
                validDirectionIntersections = directionIntersections.sort((a,b) => {
                    const aGreater = a.m_roadTime1 > startRP;
                    const bGreater = b.m_roadTime1 > startRP;
                    if (aGreater && !bGreater) return -1;
                    if (!aGreater && bGreater) return 1;
                    return a.m_roadTime1 > b.m_roadTime1;
                });
            } else {
                validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime2 > startRP)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime2 > b.m_roadTime2
                })
            }
        } else {
            directionIntersections = roadIntersections.intersections.filter(intersection => intersection.reverse.some(item => Object.keys(item).length > 0));
            if (startRoadData.looped) {            
                validDirectionIntersections = directionIntersections.sort((a,b) => {
                    const aLess = a.m_roadTime1 < startRP;
                    const bLess = b.m_roadTime1 < startRP;
                    if (aLess && !bLess) return -1;
                    if (!aLess && bLess) return 1;
                    return a.m_roadTime1 < b.m_roadTime1;
                });
            } else {
                validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime1 < startRP)
                validDirectionIntersections.sort((a,b) => {
                    return a.m_roadTime1 < b.m_roadTime1
                })
            }
        }
        if (startRoad == 1) {
            //debugger
        }
        //debugger
        //for (let intersection of validDirectionIntersections) {
        for (let int in validDirectionIntersections) {
            if (startDirection) {
                for (let option of validDirectionIntersections[int].forward) {
                    let startPath = [];
                    //TODO - check if crossing 0/1 line
                    
                    if (option.option) {
                        if (option.option.road == startRoad) {
                            continue
                        }
                        //TODO - make sure this is a known road (ie. not a running road)
                        let lineCrossed = false;
                        if (startRP > option.option.exitTime) {
                            // we have to cross the 0/1 line to get to this intersection
                            startPath.push({
                                roadId: startRoad,
                                forward: startDirection,
                                entryTime: startRP,
                                exitTime: 1
                            });
                            lineCrossed = true;
                        }
                        //debugger
                        startPath.push({
                            roadId: startRoad,
                            forward: startDirection,
                            entryTime: lineCrossed ? 0 : startRP,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        })
                        
                        explore(option.option.road, option.option.forward, 0, startPath, thisPathSoFar)
                    }
                    //debugger
                }
            } else {
                for (let option of validDirectionIntersections[int].reverse) {
                    let startPath = [];
                    //TODO - check if crossing 0/1 line
                    if (option.option) {
                        
                        if (option.option.road == startRoad) {
                            continue
                        }
                        //debugger
                        let lineCrossed = false;
                        if (startRP < option.option.exitTime) {
                            // we have to cross the 0/1 line to get to this intersection
                            startPath.push({
                                roadId: startRoad,
                                forward: startDirection,
                                entryTime: startRP,
                                exitTime: 0
                            });
                            lineCrossed = true;
                        }
                        startPath.push({
                            roadId: startRoad,
                            forward: startDirection,
                            entryTime: lineCrossed ? 1 : startRP,
                            exitTime: option.option.exitTime,
                            passedIntersections: validDirectionIntersections.slice(0, int),
                            intersection: validDirectionIntersections[int],
                            option: option.option
                        })
                        //debugger
                        
                        explore(option.option.road, option.option.forward, 0, startPath, thisPathSoFar)
                    }
                    //debugger
                    
                }
            }
            
        }
        //debugger
        shortestDistance = Infinity;
        //console.log("allPaths", allPaths)
        //console.log("Least number of hops", leastHops)
        //debugger
        const s = Date.now();
        for (let thisPath of allPaths) {
            if (thisPath.find(x => x.intersection?.m_markerId == 1190003)) {
                console.log("Ignoring path with m_markerId 1190003")
                continue;
            }
            let pathLength = 0;
            for (let section of thisPath) {
                const thisLength = measureRoadSectionV2(section, courseId, allRoads);
                if (isNaN(thisLength)) {
                    console.log("Length is NaN!", section)
                } else {
                    pathLength += thisLength
                }
            }
            if (pathLength < shortestDistance) {
                shortestDistance = pathLength;
                path = thisPath;
            }
        }
        //path = allPaths[2]
        //console.log(`Found the shortest path in ${Date.now() - s}ms`)
        const timeSpentFindingPaths = Date.now() - t;
        //console.log(`Found ${allPaths.length} possible paths in ${Date.now() - t}ms.  The shortest one was ${shortestDistance}`)
        //console.log(`Encountered ${repeatIntersections} repeated intersections`)
        //console.log(`Abandoned ${pathsTooLong} for being longer than a previously found path`)
        //console.log(`Abandoned ${tooManyHops} for too many hops`)
        //console.log(`Abandoned ${pathsOver25k} paths exceeding ${maxLength / 1000}k`)
        //console.log(`Spent ${timeSpentMeasuring}ms measuring validPaths`)
        if (!stats.init) {
            stats.allPaths = allPaths.length,
            stats.shortestDistance = shortestDistance,
            stats.pathsTooLong = pathsTooLong,
            stats.tooManyHops = tooManyHops,
            stats.exceedMaxLength = pathsOver25k,
            stats.timeSpentMeasuring = timeSpentMeasuring,
            stats.timeSpentFindingPaths = timeSpentFindingPaths,
            stats.init = true
            //console.log("Recorded stats", stats)
        }
        /*
        if (showDebugStats) {
            const debugStatsDiv = document.getElementById("debugStats");
            debugStatsDiv.innerHTML = "";
            let output = `Found ${allPaths.length} possible paths in ${Date.now() - t}ms.<br>The shortest one was ${parseInt(shortestDistance)}m<br>`            
            output += "Abandoned:<br>"
            output += `- ${pathsTooLong} longer than a previous path<br>`
            output += `- ${tooManyHops} for too many hops<br>`
            output += `- ${pathsOver25k} paths exceeding ${maxLength / 1000}k<br>`
            output += `Spent ${timeSpentMeasuring}ms measuring validPaths`
            debugStatsDiv.innerHTML = output;
        }
        */
        //debugger
    } else {
        //debugger
        console.log("Target road is the same as the start road", startPoint, endPoint, startDirection)
        const roadData = allRoads.find(x => x.id == startPoint.roadId)
        if (roadData.looped) {
                if (startDirection) {
                    if (startPoint.rp > endPoint.rp) {
                        // crossed the 0/1 line
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: 1,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, 1, intersections, allRoads)
                        },
                        {
                            entryTime: 0,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, 0, endPoint.rp, intersections, allRoads)
                        })
                    } else {
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, endPoint.rp, intersections, allRoads)
                        })
                    }
                } else {
                    if (startPoint.rp < endPoint.rp) {
                        // crossed the 0/1 line
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: 0,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, 0, intersections, allRoads)
                        },
                        {
                            entryTime: 1,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, 1, endPoint.rp, intersections, allRoads)
                        })
                    } else {
                        path.push({
                            entryTime: startPoint.rp,
                            exitTime: endPoint.rp,
                            forward: startDirection,
                            roadId: startPoint.roadId,
                            passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, endPoint.rp, intersections, allRoads)
                        })
                    }
                }
        } else {            
            path.push({
                entryTime: startPoint.rp,
                exitTime: endPoint.rp,
                forward: startDirection,
                roadId: startPoint.roadId,
                passedIntersections: getPassedIntersections(startPoint.roadId, startDirection, startPoint.rp, endPoint.rp, intersections, allRoads)
            })
        }
    }
    //debugger
    let bestPath = {};
    if (path) {
        found = true;
        bestPath.path = path;
        bestPath.distance = shortestDistance;
        bestPath.manifest = [];
        path.forEach(road => {
            const m = {
                start: road.forward ? road.entryTime : road.exitTime,
                end: road.forward ? road.exitTime : road.entryTime,
                reverse: !road.forward,
                roadId: road.roadId
            }
            if (m.start > m.end) {
                debugger
            }
            bestPath.manifest.push(m);
        })
    }
    //const bestPathIntersections = await getManifestIntersections(bestPath.manifest, courseId)
    //bestPath.testIntersections = bestPathIntersections;
    //console.log("bestPathIntersections", bestPathIntersections)
    if (found) {
        return {
            bestPath: bestPath,
            stats: stats, 
            allPaths: allPaths
        }
    } else {
        return {
            bestPath: null,
            stats: stats
        }
    }
    //return found ? bestPath : null;

}
export function findPathFromAtoBv7(startPoint, endPoint, courseRoads, courseId, options={}) {
    
    const t = Date.now();
    const maxDepth = options.maxDepthOverride || options.maxHops || 6;
    const maxLength = options.maxDistance || 15000;
    let shortestPathSoFar = Infinity;
    let stats = {};
    let allPaths = [];
    let leastHops = Infinity;
    let pathsTooLong = 0;
    let tooManyHops = 0;
    let pathsOverMaxDistance = 0;
    let timeSpentMeasuring = 0;        
    const startRoad = courseRoads[startPoint.roadId];
    const endRoad = courseRoads[endPoint.roadId];
    const epsilon = 1e-9;    
    const startingIntersections = findValidIntersections(startPoint, startRoad);
    let exploreNeeded = true;
    const noEndPointDirection = 'reverse' in endPoint ? false : true;
    //console.log("startPoint", startPoint, "endPoint", endPoint)
    if (startPoint.roadId == endPoint.roadId && (noEndPointDirection || endPoint.reverse == startPoint.reverse)) {
        if (startPoint.reverse) {
            if (startRoad.looped) {
                if (endPoint.rp < startPoint.rp && endPoint.rp >= startingIntersections[0]?.m_roadTime1) { //we are on the same road and no intersections to pass through to get to the endPoint
                    exploreNeeded = false;
                };
                if (endPoint.rp < startPoint.rp) {
                    const startDist = startRoad.curvePath.distanceBetweenRoadPercents(endPoint.rp, startPoint.rp, 4e-2) / 100;
                    allPaths.push({
                        distance: startDist,
                        manifest: [{
                            start: endPoint.rp,
                            end: startPoint.rp,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        }]
                    });
                } else {
                    const initPath = [{
                        start: 0,
                        end: startPoint.rp,
                        reverse: true,
                        roadId: startPoint.roadId
                    },
                    {
                        start: endPoint.rp,
                        end: 1,
                        reverse: true,
                        roadId: startPoint.roadId
                    }];
                    const startDist = startRoad.curvePath.distanceBetweenRoadPercents(initPath[0].start, initPath[0].end, 4e-2) / 100 + 
                                        startRoad.curvePath.distanceBetweenRoadPercents(initPath[1].start, initPath[1].end, 4e-2) / 100;
                    allPaths.push({
                        distance: startDist,
                        manifest: initPath
                    });
                }
            } else {
                if (endPoint.rp < startPoint.rp && endPoint.rp >= startingIntersections[0].m_roadTime1) { //we are on the same road and no intersections to pass through to get to the endPoint
                    exploreNeeded = false;
                };
                if (endPoint.rp < startPoint.rp) {
                    const startDist = startRoad.curvePath.distanceBetweenRoadPercents(endPoint.rp, startPoint.rp, 4e-2) / 100;
                    allPaths.push({
                        distance: startDist,
                        manifest: [{
                            start: endPoint.rp,
                            end: startPoint.rp,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        }]
                    });
                };
            }
            
        } else {
            if (startRoad.looped) {
                if (endPoint.rp > startPoint.rp && endPoint.rp <= startingIntersections[0]?.m_roadTime2) { //we are on the same road and no intersections to pass through to get to the endPoint
                    //this might need an additional check for 0/1 line
                    exploreNeeded = false;
                }
                if (endPoint.rp > startPoint.rp) {
                    const startDist = startRoad.curvePath.distanceBetweenRoadPercents(startPoint.rp, endPoint.rp, 4e-2) / 100;
                    allPaths.push({
                        distance: startDist,
                        manifest: [{
                            start: startPoint.rp,
                            end: endPoint.rp,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        }]
                    });
                } else {
                    const initPath = [{
                        start: startPoint.rp,
                        end: 1,
                        reverse: false,
                        roadId: startPoint.roadId
                    },
                    {
                        start: 0,
                        end: endPoint.rp,
                        reverse: false,
                        roadId: startPoint.roadId
                    }];
                    const startDist = startRoad.curvePath.distanceBetweenRoadPercents(initPath[0].start, initPath[0].end, 4e-2) / 100 + 
                                        startRoad.curvePath.distanceBetweenRoadPercents(initPath[1].start, initPath[1].end, 4e-2) / 100;
                    allPaths.push({
                        distance: startDist,
                        manifest: initPath
                    });
                    
                };
            } else {
                if (endPoint.rp > startPoint.rp && endPoint.rp <= startingIntersections[0].m_roadTime2) { //we are on the same road and no intersections to pass through to get to the endPoint
                    exploreNeeded = false;
                }
                if (endPoint.rp > startPoint.rp) {
                    const startDist = startRoad.curvePath.distanceBetweenRoadPercents(startPoint.rp, endPoint.rp, 4e-2) / 100;
                    allPaths.push({
                        distance: startDist,
                        manifest: [{
                            start: startPoint.rp,
                            end: endPoint.rp,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        }]
                    });
                };
            };
        };
    }
    
    if (exploreNeeded) { //we didn't encounter a situation where it's the same road and no intersections to traverse
        const dir = startPoint.reverse ? "reverse" : "forward";
        for (let intersection of startingIntersections) {            
            for (let option of intersection[dir]) {
                if (option.option.road != startPoint.roadId) {
                    let startPath;
                    let startDist = 0;
                    if (startRoad.looped && (!startPoint.reverse && startPoint.rp > intersection.m_roadTime2 || 
                                        startPoint.reverse && startPoint.rp < intersection.m_roadTime1)) {
                        startPath = [{
                            start: startPoint.reverse ? 0 : startPoint.rp,
                            end: startPoint.reverse ? startPoint.rp : 1,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        },
                        {
                            start: startPoint.reverse ? intersection.m_roadTime1 : 0,
                            end: startPoint.reverse ? 1 : intersection.m_roadTime2,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        }];
                        
                        startDist = startRoad.curvePath.distanceBetweenRoadPercents(startPath[0].start, startPath[0].end, 4e-2) / 100 +
                                                startRoad.curvePath.distanceBetweenRoadPercents(startPath[1].start, startPath[1].end, 4e-2) / 100;
                        
                    } else {
                        startPath = [{
                            start: startPoint.reverse ? intersection.m_roadTime1 : startPoint.rp,
                            end: startPoint.reverse ? startPoint.rp : intersection.m_roadTime2,
                            reverse: startPoint.reverse,
                            roadId: startPoint.roadId
                        }];
                        if (startPath[0].end < startPath[0].start) {
                            debugger
                        }
                        startDist = startRoad.curvePath.distanceBetweenRoadPercents(startPath[0].start, startPath[0].end, 4e-2) / 100;
                    }
                    const optionRoad = courseRoads[option.option.road];
                    if (optionRoad) {
                        const entryPoint = {
                            roadId: option.option.road,
                            rp: option.option.entryTime,
                            reverse: !option.option.forward
                        }
                        
                        explore(optionRoad, 0, startPath, startDist, entryPoint)
                    } else {
                        console.warn("Invalid road", option.option.road)
                    }
                }
            }
        }
    }
    function explore(road, depth, currentPath, thisPathSoFar, entryPoint) {
        if (courseId == 6 && (road.id == 97 || road.id == 137) && endPoint.roadId != 135) {
            //don't go into Repack Rush unless explicitly clicking on the road for it
            return;
        }
        const validIntersections = findValidIntersections(entryPoint, road);
        if (entryPoint.roadId == endPoint.roadId && (noEndPointDirection || entryPoint.reverse == endPoint.reverse)) {
            const directPath = [...currentPath];
            if (entryPoint.reverse) { 
                if (road.looped) {
                    if (endPoint.rp > entryPoint.rp) {
                        //check if we entered just beyond the targetRP and need to back up
                        const testProximity = road.curvePath.distanceBetweenRoadPercents(entryPoint.rp, endPoint.rp, 4e-2) / 100;
                        if (testProximity <= 100) {
                            endPoint.rp = entryPoint.rp - epsilon;
                        };
                    };
                    if (endPoint.rp < entryPoint.rp) {                        
                        directPath.push({
                            start: endPoint.rp,
                            end: entryPoint.rp,
                            reverse: entryPoint.reverse,
                            roadId: entryPoint.roadId
                        }); 
                        const thisPathDistance = road.curvePath.distanceBetweenRoadPercents(endPoint.rp, entryPoint.rp, 4e-2) / 100;
                        const totalPath = thisPathSoFar + thisPathDistance;
                        if (totalPath < shortestPathSoFar) {
                            shortestPathSoFar = totalPath;
                        };
                        allPaths.push({
                            distance: totalPath,
                            manifest: directPath
                        });
                    } else {
                        const initPath = [{
                            start: 0,
                            end: entryPoint.rp,
                            reverse: true,
                            roadId: entryPoint.roadId
                        },
                        {
                            start: endPoint.rp,
                            end: 1,
                            reverse: true,
                            roadId: entryPoint.roadId
                        }];
                        const thisPathDistance = road.curvePath.distanceBetweenRoadPercents(initPath[0].start, initPath[0].end, 4e-2) / 100 + 
                                        road.curvePath.distanceBetweenRoadPercents(initPath[1].start, initPath[1].end, 4e-2) / 100;
                        const totalPath = thisPathSoFar + thisPathDistance;
                        directPath.push(initPath[0]);
                        directPath.push(initPath[1]);
                        allPaths.push({
                            distance: totalPath,
                            manifest: directPath
                        });
                    };
                } else {
                    if (road.singleIntersection || !road.looped) {
                        //check for safe targets
                        if (endPoint.rp < road.safeTargets.reverse.start + epsilon) {
                            console.warn(`Unsafe reverse target RP, adjusting from ${endPoint.rp} to ${road.safeTargets.reverse.start + epsilon}`, road.safeTargets.reverse)
                            endPoint.rp = road.safeTargets.reverse.start + epsilon;
                        } else if (endPoint.rp > road.safeTargets.reverse.end - epsilon) {
                            console.warn(`Unsafe reverse target RP, adjusting from ${endPoint.rp} to ${road.safeTargets.reverse.end - epsilon}`, road.safeTargets.reverse)
                            endPoint.rp = road.safeTargets.reverse.end - epsilon;
                        };
                    };
                    if (endPoint.rp > entryPoint.rp) {
                        //check if we entered just beyond the targetRP and need to back up
                        const testProximity = road.curvePath.distanceBetweenRoadPercents(entryPoint.rp, endPoint.rp, 4e-2) / 100;
                        if (testProximity <= 100) {
                            endPoint.rp = entryPoint.rp - epsilon;
                        };
                    };
                    if (endPoint.rp < entryPoint.rp) {
                        directPath.push({
                            start: endPoint.rp,
                            end: entryPoint.rp,
                            reverse: entryPoint.reverse,
                            roadId: entryPoint.roadId
                        });                    
                        const thisPathDistance = road.curvePath.distanceBetweenRoadPercents(directPath.at(-1).start, directPath.at(-1).end, 4e-2) / 100;
                        const totalPath = thisPathSoFar + thisPathDistance;
                        if (totalPath < shortestPathSoFar) {
                            shortestPathSoFar = totalPath;
                        };
                        allPaths.push({
                            distance: totalPath,
                            manifest: directPath
                        });
                    }
                    if (endPoint.rp < entryPoint.rp && endPoint.rp >= validIntersections[0]?.m_roadTime1) {
                        return;
                    };
                }
            } else {
                if (road.looped) {
                    if (endPoint.rp < entryPoint.rp) {
                        //check if we entered just beyond the targetRP and need to back up
                        const testProximity = road.curvePath.distanceBetweenRoadPercents(endPoint.rp, entryPoint.rp, 4e-2) / 100;
                        if (testProximity <= 100) {
                            console.warn(`Nudging endPoint.rp from ${endPoint.rp} to ${entryPoint.rp + epsilon} on road ${entryPoint.roadId}`)                            
                            endPoint.rp = entryPoint.rp + epsilon;
                        };
                    };
                    if (endPoint.rp > entryPoint.rp) {                        
                        directPath.push({
                            start: entryPoint.rp,
                            end: endPoint.rp,
                            reverse: false,
                            roadId: entryPoint.roadId
                        });
                        const thisPathDistance = road.curvePath.distanceBetweenRoadPercents(entryPoint.rp, endPoint.rp, 4e-2) / 100;
                        const totalPath = thisPathSoFar + thisPathDistance;
                        if (totalPath < shortestPathSoFar) {
                            shortestPathSoFar = totalPath;
                        };
                        allPaths.push({
                            distance: totalPath,
                            manifest: directPath
                        });
                    } else {
                        const initPath = [{
                            start: entryPoint.rp,
                            end: 1,
                            reverse: false,
                            roadId: entryPoint.roadId
                        },
                        {
                            start: 0,
                            end: endPoint.rp,
                            reverse: false,
                            roadId: entryPoint.roadId
                        }];
                        const thisPathDistance = road.curvePath.distanceBetweenRoadPercents(initPath[0].start, initPath[0].end, 4e-2) / 100 + 
                                            road.curvePath.distanceBetweenRoadPercents(initPath[1].start, initPath[1].end, 4e-2) / 100;
                        const totalPath = thisPathSoFar + thisPathDistance;
                        if (totalPath < shortestPathSoFar) {
                            shortestPathSoFar = totalPath;
                        };
                        directPath.push(initPath[0]);
                        directPath.push(initPath[1]);
                        allPaths.push({
                            distance: totalPath,
                            manifest: directPath
                        });
                    }
                } else {
                    if (road.singleIntersection) {
                        //check for safe targets
                        if (endPoint.rp < road.safeTargets.forward.start + epsilon) {
                            console.warn(`Unsafe forward target RP, adjusting from ${endPoint.rp} to ${road.safeTargets.forward.start + epsilon}`, road.safeTargets.forward)
                            endPoint.rp = road.safeTargets.forward.start + epsilon;
                        } else if (endPoint.rp > road.safeTargets.forward.end - epsilon) {
                            console.warn(`Unsafe forward target RP, adjusting from ${endPoint.rp} to ${road.safeTargets.forward.end - epsilon}`, road.safeTargets.forward)
                            endPoint.rp = road.safeTargets.forward.end - epsilon;
                        };
                    };
                    if (endPoint.rp < entryPoint.rp) {
                        //check if we entered just beyond the targetRP and need to back up
                        const testProximity = road.curvePath.distanceBetweenRoadPercents(endPoint.rp, entryPoint.rp, 4e-2) / 100;
                        if (testProximity <= 100) {
                            endPoint.rp = entryPoint.rp + epsilon;
                        };
                    };
                    if (endPoint.rp > entryPoint.rp) {
                        directPath.push({
                            start: entryPoint.rp,
                            end: endPoint.rp,
                            reverse: false,
                            roadId: entryPoint.roadId
                        });
                        const thisPathDistance = road.curvePath.distanceBetweenRoadPercents(entryPoint.rp, endPoint.rp, 4e-2) / 100;
                        const totalPath = thisPathSoFar + thisPathDistance;
                        if (totalPath < shortestPathSoFar) {
                            shortestPathSoFar = totalPath;
                        };
                        allPaths.push({
                            distance: totalPath,
                            manifest: directPath
                        });
                    }
                    if (endPoint.rp > entryPoint.rp && endPoint.rp <= validIntersections[0]?.m_roadTime2) {
                        return;
                    };
                }         
            };         
        }
        if (thisPathSoFar >= maxLength) {
            pathsOverMaxDistance++;
            return;
        }
        if (depth > maxDepth) {
            tooManyHops++;
            return;
        }
        if (thisPathSoFar > shortestPathSoFar) {
            pathsTooLong++;
            return;
        }
        if (Date.now() - t > 5000) {
            return;
        }
        const dir = entryPoint.reverse ? "reverse" : "forward";
        for (let intersection of validIntersections) {            
            for (let option of intersection[dir]) {
                if (option.option.road != entryPoint.roadId) {
                    let thisPathDistance = 0;
                    const nextPath = [...currentPath];
                    if (road.looped && (!entryPoint.reverse && entryPoint.rp > intersection.m_roadTime2 || 
                                        entryPoint.reverse && entryPoint.rp < intersection.m_roadTime1)) {
                        const thisPath = [{
                            start: entryPoint.reverse ? 0 : entryPoint.rp,
                            end: entryPoint.reverse ? entryPoint.rp : 1,
                            reverse: entryPoint.reverse,
                            roadId: entryPoint.roadId
                        },
                        {
                            start: entryPoint.reverse ? intersection.m_roadTime1 : 0,
                            end: entryPoint.reverse ? 1 : intersection.m_roadTime2,
                            reverse: entryPoint.reverse,
                            roadId: entryPoint.roadId
                        }];
                        
                        thisPathDistance = road.curvePath.distanceBetweenRoadPercents(thisPath[0].start, thisPath[0].end, 4e-2) / 100 +
                                                road.curvePath.distanceBetweenRoadPercents(thisPath[1].start, thisPath[1].end, 4e-2) / 100;
                        nextPath.push(thisPath[0]);
                        nextPath.push(thisPath[1]);
                    } else {
                        const thisPath = {
                            start: entryPoint.reverse ? intersection.m_roadTime1 : entryPoint.rp,
                            end: entryPoint.reverse ? entryPoint.rp : intersection.m_roadTime2,
                            reverse: entryPoint.reverse,
                            roadId: entryPoint.roadId
                        };
                        if (thisPath.end <= thisPath.start) {
                            debugger
                        }
                        thisPathDistance = road.curvePath.distanceBetweenRoadPercents(thisPath.start, thisPath.end, 4e-2) / 100;                    
                        nextPath.push(thisPath);
                    }
                    const optionRoad = courseRoads[option.option.road];
                    if (optionRoad) {
                        const nextEntryPoint = {
                            roadId: option.option.road,
                            rp: option.option.entryTime,
                            reverse: !option.option.forward
                        };
                        const depthInc = road.singleIntersection ? 0 : 1;
                        explore(optionRoad, depth + depthInc, nextPath, thisPathSoFar + thisPathDistance, nextEntryPoint)
                    } else {
                        console.warn("Invalid road", option.option.road);
                    };
                };
            };
        };
    };
    for (let path of allPaths) {
        let distance = 0;
        for (let m of path.manifest) {
            distance += courseRoads[m.roadId].curvePath.distanceBetweenRoadPercents(m.start, m.end, 4e-2) / 100;
        }
        path.distance = distance;
    }
    allPaths.sort((a,b) => a.distance - b.distance);
    const shortestPath = allPaths[0]?.distance || null;
    stats = {
        allPaths: allPaths.length,
        shortestDistance: shortestPath,
        pathsTooLong: pathsTooLong,
        tooManyHops: tooManyHops,
        exceedMaxLength: pathsOverMaxDistance,
        timeSpentFindingPaths: Date.now() - t
    }
    const results = {
               allPaths: allPaths,
               stats: stats
           };
    //console.log("Results", results);
    return results;
}
function findNextIntersection(intersections, rp, reverse, looped, alsoPrevious=false) {
    let result;

    if (reverse) {
        const validReverse = intersections.filter(x => x.reverseValidForCycling);
        for (let i = validReverse.length - 1; i >= 0; i--) {
            if (validReverse[i].reverseValidForCycling && validReverse[i].m_roadTime1 < rp) {
                result = alsoPrevious ? {
                    next: validReverse[i],
                    previous: validReverse[i + 1] || []
                } : validReverse[i];
                break;
            }
        }
        if (!result && looped) {        
            for (let i = validReverse.length - 1; i >= 0; i--) {
                if (validReverse[i].reverseValidForCycling) { //find the last intersection on the road that is valid for cycling
                    result = alsoPrevious ? {
                        next: validReverse[i],
                        previous: validReverse[i + 1] || []
                    } : validReverse[i];
                    break;
                }
            }
        }
    } else {
        const validForward = intersections.filter(x => x.forwardValidForCycling);
        if (alsoPrevious) {
            const next = validForward.find(x => x.m_roadTime2 > rp) || (looped ? validForward[0] : {});
            const nextIdx = validForward.indexOf(next);
            const previous = validForward[nextIdx - 1] || (looped ? validForward.at(-1) : {});
            result = {
                next: next,
                previous: previous
            }
        } else {
            result = intersections.find(x => x.m_roadTime2 > rp && x.forwardValidForCycling);
        };
    }

    return result || [];
}
function findValidIntersections(startPoint, road) {
    let validIntersections;
    if (road.intersections.length == 1) {
        return road.intersections;
    }
    if (startPoint.reverse) {
        if (road.looped) {
            const ahead = road.intersections.filter(x => x.m_roadTime1 < startPoint.rp && x.reverseValidForCycling);
            const behind = road.intersections.filter(x => x.m_roadTime1 >= startPoint.rp && x.reverseValidForCycling);
            validIntersections = [...ahead.reverse(), ...behind.reverse()];
        } else {
            const ahead = road.intersections.filter(x => x.m_roadTime1 < startPoint.rp && x.reverseValidForCycling);
            validIntersections = [...ahead.reverse()];
        }

    } else {
        if (road.looped) {
            const ahead = road.intersections.filter(x => x.m_roadTime2 > startPoint.rp && x.forwardValidForCycling);
            const behind = road.intersections.filter(x => x.m_roadTime2 <= startPoint.rp && x.forwardValidForCycling);
            validIntersections = [...ahead, ...behind];
        } else {
            validIntersections = road.intersections.filter(x => x.m_roadTime2 > startPoint.rp && x.forwardValidForCycling);
        }
    }
    return validIntersections || [];
}

function getPassedIntersections(roadId, forward, entryTime, targetRP, intersections, allRoads) {
    const thisRoadData = allRoads.find(x => x.id == roadId)
    const thisRoadIntersections = intersections.find(int => int.id === roadId)
    
    let directionIntersections = [];
    let validDirectionIntersections = [];
    if (forward) {
        directionIntersections = thisRoadIntersections.intersections.filter(int => int.forward.some(x => Object.keys(x).length > 0));
        if (thisRoadData.looped) {
            
            validDirectionIntersections = directionIntersections.sort((a, b) => {
                const aAbove = a.m_roadTime2 > entryTime;
                const bAbove = b.m_roadTime2 > entryTime;
            
                // Sort by grouping first (above vs below entryTime)
                if (aAbove !== bAbove) {
                return aAbove ? -1 : 1;
                }
            
                // Then sort within each group by m_roadTime2 in ascending order
                return a.m_roadTime2 - b.m_roadTime2;
            });
            
        } else {
            validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime2 > entryTime)
            validDirectionIntersections.sort((a,b) => {
                return a.m_roadTime2 > b.m_roadTime2;
            })
        }            
    } else {
        directionIntersections = thisRoadIntersections.intersections.filter(int => int.reverse.some(x => Object.keys(x).length > 0));
        if (thisRoadData.looped) {
            validDirectionIntersections = directionIntersections.sort((a,b) => {
                const aLess = a.m_roadTime1 < entryTime;
                const bLess = b.m_roadTime1 < entryTime;
                if (aLess && !bLess) return -1;
                if (!aLess && bLess) return 1;
                return a.m_roadTime1 < b.m_roadTime1;
            });
        } else {                
            validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime1 < entryTime)
            validDirectionIntersections.sort((a,b) => {
                return a.m_roadTime1 < b.m_roadTime1;
            })
        }
    }
    let passedIntersections
    if (forward) {
        passedIntersections = validDirectionIntersections.filter(x => x.m_roadTime1 > entryTime && x.m_roadTime2 < targetRP)
    } else {
        passedIntersections = validDirectionIntersections.filter(x => x.m_roadTime2 < entryTime && x.m_roadTime1 > targetRP)
    }
    return passedIntersections;
}

export function getCursorCoordinates(svg, event) {
    // Get the point in SVG space
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;

    // Get the current transformation matrix of the SVG
    const ctm = svg.getScreenCTM();

    if (ctm) {
        //console.log("ctm", ctm)
        // Transform the point to the SVG coordinate system
        const cursorpt = pt.matrixTransform(ctm.inverse());
        //console.log('Cursor coordinates:', cursorpt.x, cursorpt.y);
        return { x: cursorpt.x, y: cursorpt.y };
    } else {
        console.error('Failed to get the transformation matrix.');
        return null;
    }
}

export function calcElevationGain(elevations) {
    let totalGain = 0;

    for (let i = 1; i < elevations.length; i++) {
        if (elevations[i] > elevations[i - 1]) {
            totalGain += elevations[i] - elevations[i - 1];
        }
    }

    return totalGain;
}
function measureRoadSectionV2(section, courseId, allRoads) {
    const road = allRoads.find(x => x.id == section.roadId)
    //debugger
    const startRP = section.forward ? section.entryTime : section.exitTime;
    const endRP = section.forward ? section.exitTime : section.entryTime;
    const sectionLength = road.curvePath.distanceBetweenRoadPercents(startRP, endRP, 4e-2) / 100;
    return sectionLength;    
}

export async function buildRouteData(route, courseId) {
    let totalDistance = 0;
    route.manifestDistances = [];
    route.curvePath = new curves.CurvePath();
    route.roadSegments = [];
    route.courseId = courseId;
    
    const worldList = await common.getWorldList();
    const worldMeta = worldList.find(x => x.courseId === courseId);
    const courseRoads = await common.getRoads(courseId);
    route.manifest = mergeManifest(route.manifest);
    for (const [i, x] of route.manifest.entries()) {
        //const road = await common.getRoad(courseId, x.roadId);
        const road = courseRoads.find(road => road.id == x.roadId)
        const seg = road.curvePath.subpathAtRoadPercents(x.start, x.end);
        const segDist = (road.curvePath.distanceBetweenRoadPercents(x.start, x.end, 4e-2)) / 100;
        route.manifestDistances.push({
            i: i,
            roadId: x.roadId,
            reverse: x.reverse,
            start: totalDistance,
            end: totalDistance + segDist
        });
        totalDistance += segDist;
        seg.reverse = x.reverse;
        seg.leadin = x.leadin;
        seg.roadId = x.roadId;
        for (const xx of seg.nodes) {
            xx.index = i;
        }
        route.roadSegments.push(seg);   
        route.curvePath.extend(x.reverse ? seg.toReversed() : seg);
    }
    Object.assign(route, common.supplimentPath(worldMeta, route.curvePath));
    return route;
}
function getNextIntersection(roadId, forward, start, end, allRoads, intersections) {
    const thisRoadData = allRoads.find(x => x.id == roadId)
    const thisRoadIntersections = intersections.find(int => int.id === roadId)
    
    if (!thisRoadIntersections.intersections) {
        //we hit a dead end
        return;
    }
    let directionIntersections = [];
    let validDirectionIntersections = [];
    if (forward) {
        directionIntersections = thisRoadIntersections.intersections.filter(int => int.forward.length > 0);
        if (thisRoadData.looped) {
            validDirectionIntersections = directionIntersections.sort((a,b) => {
                const aGreater = a.m_roadTime1 > start;
                const bGreater = b.m_roadTime1 > start;
                if (aGreater && !bGreater) return -1;
                if (!aGreater && bGreater) return 1;
                return a.m_roadTime1 > b.m_roadTime1;
            });
        } else {
            //validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime2 > start && x.m_roadTime2 < end)
            validDirectionIntersections = directionIntersections.filter(x => {
                if (x.m_roadTime1 < x.m_roadTime2) { //occasionally m_roadTime2 is less than m_roadTime1
                    return x.m_roadTime2 > start && x.m_roadTime2 < end;
                } else {
                    return x.m_roadTime1 > start && x.m_roadTime1 < end;
                }
            });
            validDirectionIntersections.sort((a,b) => {
                return a.m_roadTime2 > b.m_roadTime2
            })
        }
    } else {
        directionIntersections = thisRoadIntersections.intersections.filter(int => int.reverse.length > 0);
        if (thisRoadData.looped) {
            validDirectionIntersections = directionIntersections.sort((a,b) => {
                const aLess = a.m_roadTime1 < start;
                const bLess = b.m_roadTime1 < start;
                if (aLess && !bLess) return -1;
                if (!aLess && bLess) return 1;
                return a.m_roadTime1 < b.m_roadTime1;
            });
        } else {                
            //validDirectionIntersections = directionIntersections.filter(x => x.m_roadTime1 < start && x.m_roadTime1 > end)
            validDirectionIntersections = directionIntersections.filter(x => {
                if (x.m_roadTime1 < x.m_roadTime2) {//occasionally m_roadTime2 is less than m_roadTime1
                    return x.m_roadTime1 > start && x.m_roadTime1 < end;
                } else {
                    return x.m_roadTime2 > start && x.m_roadTime2 < end;
                }
            });
            validDirectionIntersections.sort((a,b) => {
                return a.m_roadTime1 < b.m_roadTime1
            })
        }
    }
    if (roadId == 13 && forward) {
        //debugger
    }
    const nextIntersection = validDirectionIntersections.length > 0 ? validDirectionIntersections[0] : [];
    if (nextIntersection.length == 0) {
        //debugger
    }
    return JSON.parse(JSON.stringify(nextIntersection));
}
export function mergeManifest(entries) {
    const merged = [];

    for (let i = 0; i < entries.length; i++) {
        const current = entries[i];
        if (!current) {
            continue
        }
        const last = merged[merged.length - 1];

        if (
            last &&
            last.roadId === current.roadId &&
            last.reverse === current.reverse &&
            last.reverse === false &&              
            last.end === current.start             
        ) {            
            last.end = current.end;
        } else if (
            last &&
            last.roadId === current.roadId &&
            last.reverse === current.reverse &&
            last.reverse === true &&
            last.start === current.end
        ) {
            last.start = current.start;
        } else {
            merged.push({ ...current });
        }
    }

    return merged;
}
export async function getManifestIntersections(manifest, courseId) {
    let intersectionList = [];
    const allRoads = await common.getRoads(courseId);
    const allCyclingRoads = allRoads.filter(x => x.sports.includes("cycling"))
    const intersections = await fetch(`data/worlds/${common.courseToWorldIds[courseId]}/roadIntersections.json`).then(response => response.json());
    //debugger
    let i = 0;
    const epsilon = 1e-9;
    for (let m of manifest) {
        let usedManifestIntersections = [];
        const start = m.reverse ? m.end : m.start;
        const end = m.reverse ? m.start : m.end;
        const thisRoadIntersections = (intersections.filter(x => x.id == m.roadId))[0].intersections
        const manifestIntersections = m.reverse ? 
            thisRoadIntersections.filter(x => x.reverse.length > 0 && (start >= x.m_roadTime1 - epsilon) && (end <= x.m_roadTime1 + epsilon)) :
            thisRoadIntersections.filter(x => x.forward.length > 0 && (start <= x.m_roadTime2 + epsilon) && (end >= x.m_roadTime2 - epsilon));
        manifestIntersections.sort((a, b) => {
            return m.reverse
                ? b.m_roadTime2 - a.m_roadTime2
                : a.m_roadTime2 - b.m_roadTime2;
        });
        if (manifestIntersections.length > 1) {
            if (m.roadId == 230) {
                console.log("manifestIntersections", manifestIntersections)
            }
            for (let j = 0; j < manifestIntersections.length - 1; j++) {                
                const dir = m.reverse ? "reverse" : "forward";
                let cyclingRoadOptions = 0;
                for (let opt of manifestIntersections[j][dir]) {
                    if (allCyclingRoads.find(x => x.id == opt.option.road)) { //some intersections have only one cycling option (others are run only)
                        cyclingRoadOptions++;
                    }
                }
                if (manifestIntersections[j].m_roadId == 0 && dir == "reverse") {
                    //debugger
                }
                if (manifestIntersections[j][dir].length == 1 || cyclingRoadOptions <= 1) {
                    //console.log(`ignoring ${dir} intersection`, manifestIntersections[j])
                    continue; // weird intersections with only one choice, ignore it.
                }
                const nextManifestOption = m.reverse ? 
                manifestIntersections[j].reverse.find(opt => !opt.option.forward && opt.option.road == m.roadId) :
                manifestIntersections[j].forward.find(opt => opt.option.forward && opt.option.road == m.roadId);
                if (nextManifestOption) {
                    const manifestEntry = {
                        roadExit: false,
                        m_markerId: manifestIntersections[j].m_markerId,
                        m_roadId: manifestIntersections[j].m_roadId,
                        m_roadTime1: manifestIntersections[j].m_roadTime1,
                        m_roadTime2: manifestIntersections[j].m_roadTime2,
                        option: nextManifestOption.option
                    }
                    intersectionList.push(manifestEntry)
                }
                if (m.roadId == 230) {
                    console.log(j, "intersectionList", intersectionList)
                }
            }
            const dir = m.reverse ? "reverse" : "forward";
            let cyclingRoadOptions = 0;
            for (let opt of manifestIntersections.at(-1)[dir]) {
                if (allCyclingRoads.find(x => x.id == opt.option.road)) { //some intersections have only one cycling option (others are run only)
                    cyclingRoadOptions++;
                }
            }
            if (m.roadId == 230) {
                console.log("this manifest", manifest[i])
                console.log("next manifest roadid", manifest[i + 1]?.roadId, "in", manifestIntersections.at(-1).reverse)
            }
            const lastManifestOption = m.reverse ? 
                manifestIntersections.at(-1).reverse.find(opt => opt.option.road == manifest[i + 1]?.roadId) :
                manifestIntersections.at(-1).forward.find(opt => opt.option.road == manifest[i + 1]?.roadId);
            if (lastManifestOption && cyclingRoadOptions > 1) {                
                const manifestEntry = {
                    roadExit: true,
                    m_markerId: manifestIntersections.at(-1).m_markerId,
                    m_roadId: manifestIntersections.at(-1).m_roadId,
                    m_roadTime1: manifestIntersections.at(-1).m_roadTime1,
                    m_roadTime2: manifestIntersections.at(-1).m_roadTime2,
                    option: lastManifestOption.option
                }
                intersectionList.push(manifestEntry)
            }
            if (m.roadId == 230) {
                console.log("lastManifestoption", lastManifestOption, "intersectionList", intersectionList)
            }
        } else if (manifestIntersections.length > 0) {
            const dir = m.reverse ? "reverse" : "forward";
            let cyclingRoadOptions = 0;
            for (let opt of manifestIntersections.at(-1)[dir]) {
                if (allCyclingRoads.find(x => x.id == opt.option.road)) { //some intersections have only one cycling option (others are run only)
                    cyclingRoadOptions++;
                }
            }
            if (manifestIntersections[0].m_markerId == 0) {
                //debugger
            }            
            if (cyclingRoadOptions <= 1) {
                //console.log(`ignoring ${dir} intersection`, manifestIntersections.at(-1))
            } else if (manifestIntersections.at(-1)[dir].length == 1 && cyclingRoadOptions <= 1) {
                //console.log(`ignoring ${dir} intersection`, manifestIntersections.at(-1))
            } else {
                const manifestIdx = manifest[i + 1] ? i + 1 : i;
                if (m.roadId == 230) {
                    console.log("manifestIdx", manifestIdx, "next roadId", manifest[manifestIdx].roadId, "manifestIntersections", manifestIntersections)
                }
                const lastManifestOption = m.reverse ? 
                    manifestIntersections.at(-1).reverse.find(opt => opt.option.road == manifest[manifestIdx].roadId) :
                    manifestIntersections.at(-1).forward.find(opt => opt.option.road == manifest[manifestIdx].roadId);
                
                if (lastManifestOption) {
                    const manifestEntry = {
                        //roadExit: m.roadId == manifest[manifestIdx].roadId ? false : true,
                        roadExit: true,
                        m_markerId: manifestIntersections.at(-1).m_markerId,
                        m_roadId: manifestIntersections.at(-1).m_roadId,
                        m_roadTime1: manifestIntersections.at(-1).m_roadTime1,
                        m_roadTime2: manifestIntersections.at(-1).m_roadTime2,
                        option: lastManifestOption.option                        
                    }
                    intersectionList.push(manifestEntry)
                }
            }
            //debugger
        }      
        
        i++
    }
    //debugger
    return intersectionList;
}



export async function getRouteSpawnAreas(courseId) {    
    let courseRoutes = await common.rpc.getRoutes(courseId);
    courseRoutes = courseRoutes.filter(x => x.sportType != 2 && !x.eventOnly);
    const routesWithSpawnAreas = courseRoutes.filter(x => !x.eventOnly && x.spawnArea);
    for (let s of routesWithSpawnAreas) {
        const spawnRoad = await common.getRoad(courseId, s.spawnArea.road);
        const distFromRoadStart = spawnRoad.curvePath.distanceBetweenRoadPercents(0, s.spawnArea.starttime, 4e-2) / 100;
        s.spawnArea.distFromRoadStart = parseInt(distFromRoadStart);    
    }
    const uniqueSpawnArea = [];
    const allSpawnAreas = [];
    const seen = new Set();
    for (let route of routesWithSpawnAreas) {
        const {road, forward} = route.spawnArea;
        const key = `${road}|${forward}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueSpawnArea.push({road, forward});
        }
    }
    for (let sa of uniqueSpawnArea) {
        const routesOnSA = routesWithSpawnAreas.filter(x => x.spawnArea.road == sa.road && x.spawnArea.forward == sa.forward);
        const groupedRoutes = groupSpawnArea(routesOnSA, 500);
        const result = groupedRoutes.map(group => {
            if (sa.forward == 1) {
                const startTimes = group.map(x => x.spawnArea.starttime);
                const endTimes = group.map(x => x.spawnArea.endtime);
                return {
                    routes: group,
                    roadId: sa.road,
                    reverse: sa.forward == 0,
                    start: Math.min(...startTimes),
                    end: Math.max(...endTimes)
                }
            } else {
                const startTimes = group.map(x => x.spawnArea.starttime);
                const endTimes = group.map(x => x.spawnArea.endtime);
                return {
                    routes: group,                    
                    roadId: sa.road,
                    reverse: sa.forward == 0,
                    start: Math.max(...startTimes),
                    end: Math.min(...endTimes)
                }
            }
        })
        sa.groupedRoutes = result;
    }
    for (let sa of uniqueSpawnArea) {
        for (let g of sa.groupedRoutes) {
            allSpawnAreas.push(g);
        }
    }
    allSpawnAreas.sort((a,b) => a.roadId - b.roadId);
    const counts = {};
    for (let sa of allSpawnAreas) {
        const roadId = sa.roadId;
        const dir = sa.reverse ? "R": "F";
        counts[roadId] = (counts[roadId] || 0) + 1;
        sa.name = `${roadId}.${counts[roadId]}-${dir}`;
    }
    return allSpawnAreas;
}

export function groupSpawnArea(items, window = 500) {
    const sorted = [...items].sort(
        (a, b) => a.spawnArea.distFromRoadStart - b.spawnArea.distFromRoadStart
    );

    const groups = [];
    let currentGroup = [];

    for (const item of sorted) {
        const dist = item.spawnArea.distFromRoadStart;

        if (
            currentGroup.length === 0 ||
            dist - currentGroup[0].spawnArea.distFromRoadStart <= window
        ) {
            currentGroup.push({
                name: item.name,
                id: item.id,
                distance: item.distanceInMeters,
                spawnArea: item.spawnArea
            });
        } else {
            
            groups.push(currentGroup);
            currentGroup = [{
                name: item.name,
                id: item.id,
                distance: item.distanceInMeters,
                spawnArea: item.spawnArea
            }];
        }
    }

    if (currentGroup.length) groups.push(currentGroup);

    return groups;
}

export function calculateBearing(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  const forward = Number(angle.toFixed(3));
  const reverse = Number(((forward + 180) % 360).toFixed(3));
  
  return { forward, reverse };
}

export function latlngToRoad(lat, lon, courseId, worldMeta, courseRoads) {
    /*
    if (!worldMeta) {
        const worldList = await common.getWorldList();
        worldMeta = worldList.find(x => x.courseId == courseId);
    }
    if (!courseRoads) {
        courseRoads = await common.getRoads(courseId);
    } 
    */   
    const pos = worldMeta.flippedHack ? [
            (lat - worldMeta.latOffset) * worldMeta.latDegDist * 100,
            (lon - worldMeta.lonOffset) * worldMeta.lonDegDist * 100
        ] : [
            (lon - worldMeta.lonOffset) * worldMeta.lonDegDist * 100,
            -(lat - worldMeta.latOffset) * worldMeta.latDegDist * 100
        ];
    const possibleRoads = [];
    for (let road of courseRoads) {
        const points = road.path;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const p of points) {
            const [x, y, z] = p;

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        const bounds = { minX, maxX, minY, maxY, minZ, maxZ };
        const x = pos[0];
        const y = pos[1];        
        if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
            possibleRoads.push(road);
        }
    }
    let nearestPoints = [];
    
    for (let road of possibleRoads) {  
        let thisRoadNearestPoint;
        let minDistance = Infinity;
        if (road.distances.at(-1) < 750) {
            //console.log("ignoring short road", road)     
            continue; 
        }
        const steps = 2500;
        const points = [];
        const step = 1 / (steps - 1);
        for (let i = 0; i < steps; i++) {
            points.push(i * step);
        }
        let i = 0;
        for (let t of points) {
            const point2 = road.curvePath.pointAtRoadPercent(t);
            const dx = point2[0] - pos[0]; 
            const dy = point2[1] - pos[1]; 
            //const dz = point2[2] - points[2]; //ignoring altitute.... maybe dumb

            // Use the Euclidean distance formula
            //const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
                minDistance = distance;
                thisRoadNearestPoint = {
                    roadId: road.id,
                    point: point2,
                    rp: t,
                    distance: distance,
                    i: i
                }
            }
            i++;
        }
        if (thisRoadNearestPoint.distance < 1000) {
            nearestPoints.push(thisRoadNearestPoint);
        }
    }
    return nearestPoints;
    /*
    if (nearestPoint.distance < 1000) {
        return nearestPoint;
    } else {
        console.log("nearestPoint too far away", nearestPoint)
        return null;
    }
    */
    
}
export function pointToRoad(point, worldMeta, courseRoads) {
    let lat = point.lat;
    let lon = point.lng;
    const pos = worldMeta.flippedHack ? [
            (lat - worldMeta.latOffset) * worldMeta.latDegDist * 100,
            (lon - worldMeta.lonOffset) * worldMeta.lonDegDist * 100,
            altitudeToZ(worldMeta, point.altitude)
        ] : [
            (lon - worldMeta.lonOffset) * worldMeta.lonDegDist * 100,
            -(lat - worldMeta.latOffset) * worldMeta.latDegDist * 100,
            altitudeToZ(worldMeta, point.altitude)
        ];
    
    const possibleRoads = [];
    //for (let road of courseRoads) 
    for (let road of Object.values(courseRoads)) {
        if (worldMeta.courseId == 8 && (road.id == 10 || road.id == 11 || road.id == 12 || road.id == 13)) {
            continue;
        }
        if (worldMeta.courseId == 13 && road.id ==3) {
            continue;
        }
        const points = road.path;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const p of points) {
            const [x, y, z] = p;

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        const bounds = { minX, maxX, minY, maxY, minZ, maxZ };
        const x = pos[0];
        const y = pos[1];        
        if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
            possibleRoads.push(road);
        }
    }
    //console.log("possibleRoads", possibleRoads)
    let nearestPoints = [];
    
    for (let road of possibleRoads) { 
        if (road.distances.at(-1) < 750) {
            //continue; //ignore short roads, the routing later will pick them up
        }
        
        const thisRoadNearestPoint = roadPercentAtPointLinear(pos, road);
        if (thisRoadNearestPoint.distance < 1000) {
            nearestPoints.push(thisRoadNearestPoint);
        }
    }
    return nearestPoints;
    /*
    if (nearestPoint.distance < 1000) {
        return nearestPoint;
    } else {
        console.log("nearestPoint too far away", nearestPoint)
        return null;
    }
    */
    
}
export function importSauceCSV(csvData) {
    const requiredFields = ['distance', 'lat', 'lng', 'altitude'];
  
    const lines = csvData
        .trim()
        .split(/\r?\n/)
        .filter(l => l.trim() !== '');

    if (lines.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row.');
    }

    const headers = lines[0]
        .split(',')
        .map(h => h.trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
        );

    
    const missing = requiredFields.filter(f => !headers.includes(f));
    if (missing.length) {
        throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }

    
    const indexByHeader = Object.fromEntries(
        headers.map((h, i) => [h, i])
    );
    
    const data = lines.slice(1).map((line, rowIdx) => {
        const values = line.split(',').map(v => v.trim());

        const row = {};
        for (const field of requiredFields) {
        const raw = values[indexByHeader[field]];
        const num = Number(raw);

        if (!Number.isFinite(num)) {
            throw new Error(
            `Invalid numeric value for "${field}" on row ${rowIdx + 2}`
            );
        }

        row[field] = num;
        }

        return row;
    });

    return data;
}
export function getKmPts(data) {
    const startDistance = data[0].distance;
    const maxDistance = data.at(-1).distance;
    const kmMarkers = [];
    for (let i = startDistance;i < maxDistance;i = i + 50) {
        const m = data.find(x => x.distance > i);
        kmMarkers.push(m);
    }
    return kmMarkers;
}
export function summarizeRdPtsv1(rdPts) {
    const result = [];
    let current = null;

    for (const group of rdPts) {
    // Ignore anything that does not contain exactly one object
    if (!Array.isArray(group) || group.length !== 1) {
        continue;
    }

    const { roadId, rp } = group[0];

    if (!current || current.roadId !== roadId) {
        // Finish previous segment
        if (current) {
        result.push(current);
        }

        // Start a new segment
        current = {
        roadId,
        start: rp,
        end: rp
        };
    } else {
        // Extend current segment
        current.end = rp;
    }
    }

    // Finalize last segment
    if (current) {
    result.push(current);
    }
    const manifest = [];
    for (let r of result) {
        if (r.start <= r.end) {
            manifest.push({
                roadId: r.roadId,
                reverse: false,
                start: r.start,
                end: r.end
            })
        } else {
            manifest.push({
                roadId: r.roadId,
                reverse: true,
                start: r.end,
                end: r.start
            })
        }
    }
    const results = {
        manifest: manifest,
        raw: result
    }
    return results;
}
export function summarizeRdPts(rdPts, courseId, courseRoads, onlyUnique=false) {
    const result = [];
    let current = null;
    let lastRp = null;
    if (onlyUnique) {
        rdPts = rdPts.filter(x => x.length == 1);
    }

    for (const group of rdPts) {
    // Ignore anything that does not contain exactly one object
    if (!Array.isArray(group) || group.length == 0) {
        continue;
    }
    let roadId;
    let rp;

    if (group.length > 1) {
        //const lastRoad = result.at(-1);
        if (current) {
            const sameRoad = group.find(x => x.roadId == current.roadId);
            if (sameRoad) {
                //debugger
                if (courseId == 6 && sameRoad.roadId == 24 && sameRoad.rp > 0.884) { // ugly Volcano hack to ensure we get off the road at the top for the loop around
                    const otherRoad = group.find(x => x.roadId != 24);
                    if (otherRoad) {
                        roadId = otherRoad.roadId;
                        rp = otherRoad.rp;
                    } else {
                        // this shouldn't happen but just in case
                        console.log("This shouldn't happen - weird happenings on the Volcano!", group)
                        roadId = sameRoad.roadId;
                        rp = sameRoad.rp;
                    }
                } else {
                    roadId = sameRoad.roadId;
                    rp = sameRoad.rp;
                }
                //debugger
            } else {
                const minDist = group.reduce((min, item) => {
                    return item.distance < min.distance ? item : min;
                });
                if (minDist) {
                    roadId = minDist.roadId;
                    rp = minDist.rp;
                }
            }
        } else {
            continue;
        }
    } else {
        roadId = group[0].roadId;
        rp = group[0].rp
    }

    //const { roadId, rp } = group[0];

    if (!current) {
        current = { roadId, start: rp, end: rp };
        lastRp = rp;
        continue;
    }

    const sameRoad = current.roadId === roadId;
    const delta = rp - lastRp;

    // Detect wrap-around while staying on same road
    const ascendingWrap = sameRoad && delta < -0.5;
    const descendingWrap = sameRoad && delta > 0.5;
    if (group[0].roadId == 24 && group.length == 1) {
        //debugger
    }
    if (!sameRoad || ascendingWrap || descendingWrap) {
        // Close out current segment
        if (ascendingWrap) {
        //debugger
        //current.end = 1;
        } else if (descendingWrap) {
        //debugger
        //current.end = 0;
        }
        result.push(current);
        // Start new segment
        current = {
        roadId,
        start: rp,
        end: rp
        };
    } else {
        // Extend current segment
        current.end = rp;
    }

    lastRp = rp;
    }
    //debugger
    // Finalize last segment
    if (current) {
    result.push(current);
    }

    const manifest = [];
    for (let r of result) {
        if (r.start >= 0 && r.end >= 0 && r.roadId >= 0) {
            if (r.start <= r.end) {
                manifest.push({
                    roadId: r.roadId,
                    reverse: false,
                    start: r.start,
                    end: r.end
                })
            } else {
                manifest.push({
                    roadId: r.roadId,
                    reverse: true,
                    start: r.end,
                    end: r.start
                })
            }
        }
    }
    const sanitizedManifest = [];
    for (let i = 0; i < manifest.length - 1; i++) {
        const m = manifest[i];
        //const mRoad = allCyclingRoads.find(x => x.id == m.roadId);
        const mRoad = courseRoads[m.roadId]
        if (mRoad.singleIntersection) {
            const nextManifest = manifest[i + 1];      
            //todo - also check if it's plausible to get from previous road to this one    
            if (mRoad.id == 161)  {
                //debugger
            }
            let plausibleRoad;
            if (m.reverse) {
                plausibleRoad = mRoad.intersections.find(x => x.reverse.find(y => y.option.road == nextManifest.roadId));
            } else {
                plausibleRoad = mRoad.intersections.find(x => x.forward.find(y => y.option.road == nextManifest.roadId));
            }
            if (plausibleRoad) {
                sanitizedManifest.push(m);
            }
        } else {
            sanitizedManifest.push(m);
        }
    }
    sanitizedManifest.push(manifest.at(-1));
    //debugger
    const results = {
        manifest: sanitizedManifest,
        raw: result
    }
    return results;
}

export function altitudeToZ(worldMeta, altitude, { physicsSlopeScale } = {}) {
    const scale = physicsSlopeScale || worldMeta?.physicsSlopeScale || 1;
    const seaLevel = worldMeta?.seaLevel || 0;
    const elOffset = worldMeta?.eleOffset || 0;
    return altitude * 100 / scale + seaLevel - elOffset;
}

export function roadPercentAtPointLinear(targetPoint, road, epsilon=0.0001) {
    let closestPercent = 0;
    let closestDistance = Infinity;
    let closestPoint;
    let i = 1;
    //for (let rp = 0; rp <= 1; rp += epsilon) {
    for (let point of road.points) {
        //const point = road.curvePath.pointAtRoadPercent(rp);
        const distance = curves.vecDist(point.point, targetPoint);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPercent = point.rp;
            closestPoint = point.point;
        }
        i++;
    }
    
    return {
        roadId: road.id,
        rp: closestPercent,
        distance: closestDistance,
        i: i,
        point: closestPoint
    }
}
function mergeCloseManifest(first, second, courseRoads) {
    let merged;
    const manifest = [];
    if (first.reverse) {
        if (courseRoads[first.roadId].looped && first.start < second.end) {
            first.start = 0;
            second.end = 1;
            manifest.push(first);
            manifest.push(second);
        } else {
            const gapDistance = courseRoads[first.roadId].curvePath.distanceBetweenRoadPercents(second.end, first.start, 4e-2) / 100;
            console.warn(`Distance from road ${first.roadId} start ${second.end}, end ${first.start} is ${gapDistance}`)
            if (gapDistance < 500) {
                merged = {
                    roadId: first.roadId,
                    reverse: first.reverse,
                    start: second.start,
                    end: first.end
                }
            } else {
                //same road with a gap but it's more than 500m?
                debugger
            }
        }
    } else {
        if (courseRoads[first.roadId].looped && first.end > second.start) {
            first.end = 1;
            second.start = 0;
            manifest.push(first);
            manifest.push(second);
        } else {
            const gapDistance = courseRoads[first.roadId].curvePath.distanceBetweenRoadPercents(first.end, second.start, 4e-2) / 100;
            console.warn(`Distance from road ${first.roadId} start ${first.end}, end ${second.start} is ${gapDistance}`)
            if (gapDistance < 500) {
                merged = {
                    roadId: first.roadId,
                    reverse: first.reverse,
                    start: first.start,
                    end: second.end
                }
            } else {
                //same road with a gap but it's more than 500m?
                debugger
            }
        }
    }
    if (merged) {
        manifest.push(merged);
    } else if (manifest.length == 0){
        //nothing merged even though same road and direction
        debugger
    }
    return manifest;
}
export function buildCustomManifestv2(manifestData, courseRoads, courseId) {
    if (manifestData.manifest.length <= 1) {
        return manifestData;
    }
    const manifest = [];
    const initManifest = manifestData.manifest.filter(x => x.end != x.start); // pull out stray points that don't make sense    
    for (let i = 0; i < initManifest.length; i++) {
        const first = initManifest[i];
        const second = initManifest[i + 1];
        const third = initManifest[i + 2];
        if (!second) {
            manifest.push(initManifest[i]);
            continue;
        }
        //if (courseId == 13 && first.roadId == 3) { // ignore the weird little roundabout road in Makuri at the entrance to Neokyo
        //    continue;
        //}
        if (first.roadId == second.roadId && first.reverse == second.reverse) {
            const initMerged = mergeCloseManifest(first, second, courseRoads);
            if (third && third.roadId == initMerged.at(-1).roadId && third.reverse == initMerged.at(-1).reverse) {
                const nextMerged = mergeCloseManifest(initMerged.at(-1), third, courseRoads)
                for (let m of nextMerged) {
                    manifest.push(m);
                }
                i = i + 2;
            } else {
                for (let m of initMerged) {
                    manifest.push(m)
                }
                i++;
            }
        } else {
            manifest.push(initManifest[i]);
        }
    };
    const newManifest = [];
    const epsilon = 1e-6;
    for (let i = 0; i < manifest.length - 1; i++) {    
          
        const mRoad = courseRoads[manifest[i].roadId];
        if (mRoad.looped) {            
            if (manifest[i].reverse && manifest[i].start == 0) {
                const next = manifest[i + 1];
                if (next && next.roadId == manifest[i].roadId && next.reverse == manifest[i].reverse) {
                    newManifest.push(manifest[i]);
                    //newManifest.push(next);
                    //i++;
                    continue;
                }
            } else if (!manifest[i].reverse && manifest[i].end == 1) {
                const next = manifest[i + 1];
                if (next && next.roadId == manifest[i].roadId && next.reverse == manifest[i].reverse) {
                    newManifest.push(manifest[i]);
                    //newManifest.push(next);
                    //i++;
                    continue;
                }
            }
            if (manifest[i].roadId == 134) {
                //debugger
            }
        }
        const startRp = manifest[i].reverse ? manifest[i].start + epsilon : manifest[i].end - epsilon;
        const nextIntersection = findNextIntersection(mRoad.intersections, startRp, manifest[i].reverse, mRoad.looped, true);
        
        if (nextIntersection.next) {
            let distanceToIntersection;
            if (manifest[i].reverse) {
                if (nextIntersection.next.m_roadTime1 > startRp) {
                    distanceToIntersection = (mRoad.curvePath.distanceBetweenRoadPercents(0, startRp, 4e-2) / 100) + (mRoad.curvePath.distanceBetweenRoadPercents(nextIntersection.next.m_roadTime1, 1, 4e-2) / 100);
                } else {
                    distanceToIntersection = mRoad.curvePath.distanceBetweenRoadPercents(nextIntersection.next.m_roadTime1, startRp, 4e-2) / 100;
                }
            } else {
                if (nextIntersection.next.m_roadTime2 < startRp) {
                    distanceToIntersection = (mRoad.curvePath.distanceBetweenRoadPercents(startRp, 1, 4e-2) / 100) + (mRoad.curvePath.distanceBetweenRoadPercents(0, nextIntersection.next.m_roadTime2, 4e-2) / 100);                    
                } else {
                    distanceToIntersection = mRoad.curvePath.distanceBetweenRoadPercents(startRp, nextIntersection.next.m_roadTime2, 4e-2) / 100;
                }
            }
            if (distanceToIntersection < 500) {
                //we are close to an intersection and should be good to find a path.
                const startPoint = {
                    roadId: manifest[i].roadId,
                    reverse: manifest[i].reverse,
                    rp: startRp
                };
                const endPoint = {
                    roadId: manifest[i + 1].roadId,
                    reverse: manifest[i + 1].reverse,
                    rp: manifest[i + 1].reverse ? manifest[i + 1].end - epsilon : manifest[i + 1].start + epsilon
                };
                const path = findPathFromAtoBv7(startPoint, endPoint, courseRoads, courseId, {maxDepthOverride: 2});
                if (path && path.allPaths.length > 0) {
                    const shortestPath = path.allPaths[0];
                    newManifest.push({
                        roadId: manifest[i].roadId,
                        reverse: manifest[i].reverse,
                        start: shortestPath.manifest[0].reverse ? shortestPath.manifest[0].start : manifest[i].start,
                        end: shortestPath.manifest[0].reverse ? manifest[i].end : shortestPath.manifest[0].end
                    });
                    for (let m = 1; m < shortestPath.manifest.length; m++) {
                        newManifest.push(shortestPath.manifest[m]);
                    }
                } else {
                    debugger
                    //handle missing path - why isn't 133 calculating the entrypoint behind in reverse?
                }
                //debugger
            } else {
                //next intersection isn't close, what about the previous one?
                if (Object.keys(nextIntersection.previous).length > 0) {
                    let distanceToIntersection;
                    if (manifest[i].reverse) {
                        if (nextIntersection.previous.m_roadTime1 < startRp) {
                            distanceToIntersection = (mRoad.curvePath.distanceBetweenRoadPercents(0, startRp, 4e-2) / 100) + (mRoad.curvePath.distanceBetweenRoadPercents(nextIntersection.previous.m_roadTime1, 1, 4e-2) / 100);
                        } else {
                            distanceToIntersection = mRoad.curvePath.distanceBetweenRoadPercents(startRp, nextIntersection.previous.m_roadTime1, 4e-2) / 100;
                        }
                    } else {
                        if (nextIntersection.previous.m_roadTime2 > startRp) {
                            distanceToIntersection = (mRoad.curvePath.distanceBetweenRoadPercents(startRp, 1, 4e-2) / 100) + (mRoad.curvePath.distanceBetweenRoadPercents(0, nextIntersection.previous.m_roadTime2, 4e-2) / 100);                    
                        } else {
                            distanceToIntersection = mRoad.curvePath.distanceBetweenRoadPercents(nextIntersection.previous.m_roadTime1, startRp, 4e-2) / 100;
                        }
                    }
                    if (distanceToIntersection < 200) {
                        //we are close to an intersection and should be good to find a path.
                        const startPoint = {
                            roadId: manifest[i].roadId,
                            reverse: manifest[i].reverse,
                            rp: manifest[i].reverse ? nextIntersection.previous.m_roadTime2 + epsilon : nextIntersection.previous.m_roadTime1 - epsilon
                        };
                        const endPoint = {
                            roadId: manifest[i + 1].roadId,
                            reverse: manifest[i + 1].reverse,
                            rp: manifest[i + 1].reverse ? manifest[i + 1].end - epsilon : manifest[i + 1].start + epsilon
                        }
                        const path = findPathFromAtoBv7(startPoint, endPoint, courseRoads, courseId, {maxDepthOverride: 2})
                        if (path && path.allPaths.length > 0) {
                            const shortestPath = path.allPaths[0];
                            newManifest.push({
                                roadId: manifest[i].roadId,
                                reverse: manifest[i].reverse,
                                start: shortestPath.manifest[0].reverse ? shortestPath.manifest[0].start : manifest[i].start,
                                end: shortestPath.manifest[0].reverse ? manifest[i].end : shortestPath.manifest[0].end
                            });
                            for (let m = 1; m < shortestPath.manifest.length; m++) {
                                newManifest.push(shortestPath.manifest[m]);
                            }
                        } else {
                            //handle missing path
                        }

                    } else {
                        //no intersections close by at all?
                        debugger
                    }
                } else {
                    //no previous intersection to check
                    debugger
                }
                //debugger
            }
            
        } else {
            //what if there isn't a next intersection?  See if the previous one is close
            debugger
        }
    }
    const lastManifest = manifest.at(-1);
    const lastNewManifest = newManifest.at(-1);
    newManifest.push(lastManifest);
    if (lastManifest.roadId == lastNewManifest.roadId && lastManifest.reverse == lastNewManifest.reverse) {
        //debugger
        console.log("lastManifest", lastManifest, "lastNewManifest", lastNewManifest)
        if (lastManifest.reverse) {
            //lastNewManifest.start = lastManifest.start;
        } else {
            //lastNewManifest.end = lastManifest.end;
        }
    } else {
        debugger
    };
    const finalManifest = {
        manifest: newManifest
    };
    return finalManifest;

}
export async function buildCustomManifest(manifestData, intersections, courseRoads, courseId) {
    const manifest = manifestData.manifest;
    let lastManifestIdx = [];
    let lastPoint;
    const newManifest = [];
    let initOffset = 0;
    initOffset = (manifest[0].end - manifest[0].start) / 4;
    //fix this madness in France...
    if (manifest[0].reverse) {
        lastPoint = {
            roadId: manifest[0].roadId,
            //rp: manifest[0].end,
            rp: manifest[0].reverse ? manifest[0].end - initOffset : manifest[0].start + initOffset,
            reverse: true
        }
    } else {
        lastPoint = {
            roadId: manifest[0].roadId,
            //rp: manifest[0].start,
            rp: manifest[0].reverse ? manifest[0].end - initOffset : manifest[0].start + initOffset,
            reverse: false
        }
    }
    let alternatePath = false;
    for (let i = 1; i < manifest.length; i++) {
        const t = Date.now();
        if (manifest[i].end == manifest[i].start) {
            continue; // ignore stray manifest points that likely don't make sense
        }
        let rpOffset = 0;
        let nextRp;
        let usedOffset = false;
        if (i == manifest.length - 1) {
            nextRp = manifest[i].reverse ? manifest[i].start : manifest[i].end;
        } else {
            // rather than mid point go much closer to exit point
            rpOffset = (manifest[i].end - manifest[i].start) / 4;
            nextRp = manifest[i].reverse ? manifest[i].end - rpOffset : manifest[i].start + rpOffset;
            usedOffset = true;
        }
        let nextPoint = {
            roadId: manifest[i].roadId,
            rp: nextRp,
            reverse: manifest[i].reverse
        }
        if (courseId == 8 && (nextPoint.roadId == 5 || nextPoint.roadId == 232)) {
            //need to target the middle of some roads to ensure entryPoint is safe for routing
            nextPoint.rp = 0.5;
        }
        console.log("lastPoint", lastPoint, "nextPoint", nextPoint)
        if (lastPoint.rp > 1 || nextPoint.rp > 1) {
            debugger
        }
        //debugger
        if (lastPoint.roadId == 4 && nextPoint.roadId == 5) {
            //debugger
        }
        
        //const path = findPathFromAtoBv6(lastPoint, nextPoint, intersections, allRoads, courseId, true, 2);
        const options = {
            maxDepthOverride: 2
        }
        const paths = findPathFromAtoBv7(lastPoint, nextPoint, courseRoads, courseId, options);
        if (paths && paths.allPaths[0]?.manifest?.length > 0) {
            console.log("path", paths)
            const path = paths.allPaths[0];
            if (usedOffset) {                
                if (path.manifest.at(-1).reverse) {
                    path.manifest.at(-1).start = manifest[i].start + rpOffset;
                } else {
                    path.manifest.at(-1).end = manifest[i].end - rpOffset;
                }                
            }
            for (let m of path.manifest) {
                if (m.start > m.end) {
                    debugger
                }
                newManifest.push(m)
            }
            alternatePath = false;
        } else {
            console.warn("No path found from", lastPoint, "to", nextPoint)
            if (!manifest[i - 2]) {
                debugger
            }
            let testPath;
            let testDirection;
            //const nextPointRoad = allRoads.find(x => x.id == nextPoint.roadId);
            const nextPointRoad = courseRoads[nextPoint.roadId]
            if (nextPointRoad && nextPointRoad.singleIntersection) {
                if (manifest[i + 1]) {
                    rpOffset = (manifest[i + 1].end - manifest[i + 1].start) / 4;
                    nextRp = manifest[i + 1].reverse ? manifest[i + 1].end - rpOffset : manifest[i + 1].start + rpOffset;
                    nextPoint = {
                        roadId: manifest[i + 1].roadId,
                        rp: nextRp,
                        reverse: manifest[i + 1].reverse
                    }
                console.log("Trying forward one point - lastPoint", lastPoint, "nextPoint", nextPoint)
                //testPath = findPathFromAtoBv6(lastPoint, nextPoint, intersections, courseRoads, courseId, true, 2);
                const options = {
                    maxDepthOverride: 2
                }
                testPath = findPathFromAtoBv7(lastPoint, nextPoint, courseRoads, courseId, options)
                testDirection = "forward";
                }
            } else {
            
                const twoPointsBack = {
                    roadId: manifest[i - 2].roadId,
                    reverse: manifest[i - 2].reverse,
                    rp: (manifest[i - 2].start + manifest[i - 2].end) / 2
                }
                //debugger
                console.log("Trying BACK one point - twoPointsBack", twoPointsBack, "nextPoint", nextPoint)
                //testPath = findPathFromAtoBv6(twoPointsBack, nextPoint, intersections, courseRoads, courseId, true, 2);
                const options = {
                    maxDepthOverride: 2
                }
                testPath = findPathFromAtoBv7(twoPointsBack, nextPoint, courseRoads, courseId, options);
                testDirection = "reverse";
            }
            if (testPath && testPath.bestPath?.manifest?.length > 0) {
                 
                //debugger  
                if (testDirection == "forward") {
                    //bump forward one manifest entry
                    i++;
                } else {
                    //found a path by rolling back a step
                    newManifest.length = lastManifestIdx.at(-2); // pull the bad entries off the manifest
                    if (testPath.bestPath.manifest[0].reverse) {
                        testPath.bestPath.manifest[0].end  = manifest[i - 2].end;
                    } else {
                        testPath.bestPath.manifest[0].start = manifest[i - 2].start;
                    }
                    //debugger
                }
                for (let m of testPath.bestPath.manifest) {
                    if (m.start > m.end) {
                        debugger
                    }
                    newManifest.push(m)
                }
                
            alternatePath = true;
            //debugger
            }
        }
        const manifestEnd = newManifest.at(-1);
        lastPoint = {
            roadId: newManifest.at(-1).roadId,
            rp: manifestEnd.reverse ? manifestEnd.start : manifestEnd.end,
            reverse: manifestEnd.reverse
        }
        //console.log("manifest", manifest, "newManifest", newManifest)
        if (usedOffset) {
            //debugger
        }
        //debugger
        lastManifestIdx.push(newManifest.length - 1);
        console.log(`Last manifest took ${Date.now() - t}ms`)
    }
    //debugger
    const finalManifest = {
        manifest: newManifest
    }
    return finalManifest;
}
export function fixBadIntersections(intersections) {
    if (!intersections) {
        return null;
    }
    for (let road of intersections) {
        if (road.intersections) {
            for (let int of road.intersections) {
                if (int.m_roadTime1 > int.m_roadTime2) { //in rare cases, m_roadTime1 is greater than m_roadTime2 and this causes havoc...
                    [int.m_roadTime1, int.m_roadTime2] = [int.m_roadTime2, int.m_roadTime1];
                }
            }
        }
    }
    return intersections;
}
export function getRoadPoints(road) {
    const roadDistance = parseInt(road.distances.at(-1));
    const epsilon = 1 / (roadDistance);
    const points = [];
    for (let rp = 0; rp <= 1; rp += epsilon) {
        const point = road.curvePath.pointAtRoadPercent(rp);
        points.push({
            rp: rp,
            point: point
        })
    }
    return points;
}
export async function generateRoadData(courseId) { 
    const worldList = await common.getWorldList();   
    const worldId = (worldList.find(x => x.courseId == courseId)).worldId;
    const worldIntersections = await fetch(`data/worlds/${worldId}/roadIntersections.json`).then(response => response.json());
    const intersections = fixBadIntersections(worldIntersections);
    const courseRoads = await common.getRoads(courseId);
    const allCyclingRoads = courseRoads.filter(x => x.sports.includes("cycling"));
    const singleIntersectionRoads = intersections.filter(road => road.intersections?.length <= 2 && road.intersections?.every(int => int.forward?.length <= 1 && int.reverse?.length <= 1))
    const epsilon = 1e-6;
    for (let road of allCyclingRoads) {
        road.points = getRoadPoints(road);
        road.entryPoints = [];
        road.safeTargets = {
            reverse: {
                start: 0,
                end: 1
            },
            forward: {
                start: 0,
                end: 1
            }
        };
    }
    for (let road of allCyclingRoads) {
        const singleIntersection = singleIntersectionRoads.find(x => x.id == road.id);
        road.singleIntersection = singleIntersection ? true : false;
        const thisRoadIntersections = intersections.find(x => x.id == road.id);
        if (thisRoadIntersections) {
            thisRoadIntersections.intersections?.sort((a,b) => a.m_roadTime1 - b.m_roadTime2);
            if (thisRoadIntersections && thisRoadIntersections.intersections) {
                for (let int of thisRoadIntersections.intersections) {
                    let forwardCyclingOptions = 0;
                    let reverseCyclingOptions = 0;
                    for (let option of int.forward) {
                        if (option.option.road != road.id) {
                            const nextRoad = allCyclingRoads.find(x => x.id == option.option.road);
                            if (nextRoad) {
                                let minDistance = Infinity;
                                let nearestPoint;
                                let entryTime;
                                for (let point of nextRoad.points) {
                                    const exitPoint = road.curvePath.pointAtRoadPercent(option.option.exitTime);
                                    const distance = curves.vecDist(exitPoint, point.point);
                                    if (distance < minDistance) {
                                        minDistance = distance;
                                        nearestPoint = point.point;
                                        entryTime = point.rp;
                                    }
                                }
                                option.option.entryTime = entryTime;
                                nextRoad.entryPoints.push({
                                    entryTime: entryTime,
                                    reverse: !option.option.forward
                                });
                                option.option.cycling = true;
                                forwardCyclingOptions++;
                            } else {
                                option.option.cycling = false;
                            }
                        } else {
                            option.option.cycling = true;
                            forwardCyclingOptions++;
                        }
                    }
                    for (let option of int.reverse) {
                        if (option.option.road != road.id) {
                            const nextRoad = allCyclingRoads.find(x => x.id == option.option.road);
                            if (nextRoad) {
                                let minDistance = Infinity;
                                let nearestPoint;
                                let entryTime;
                                for (let point of nextRoad.points) {
                                    const exitPoint = road.curvePath.pointAtRoadPercent(option.option.exitTime);
                                    const distance = curves.vecDist(exitPoint, point.point);
                                    if (distance < minDistance) {
                                        minDistance = distance;
                                        nearestPoint = point.point;
                                        entryTime = point.rp;
                                    }
                                }
                                option.option.entryTime = entryTime;
                                nextRoad.entryPoints.push({
                                    entryTime: entryTime,
                                    reverse: !option.option.forward
                                });
                                option.option.cycling = true;
                                reverseCyclingOptions++;
                            } else {
                                option.option.cycling = false;
                            }
                        } else {
                            reverseCyclingOptions++;
                            option.option.cycling = true;
                        }
                    }
                    int.forwardValidForCycling = road.singleIntersection || (forwardCyclingOptions > 1 && int.m_roadTime1 != int.m_roadTime2);
                    int.reverseValidForCycling = road.singleIntersection || (reverseCyclingOptions > 1 && int.m_roadTime1 != int.m_roadTime2);
                }
                if (!road.looped && 
                    !thisRoadIntersections.intersections.at(-1).forwardValidForCycling && 
                    thisRoadIntersections.intersections.at(-1).forward.length == 1 &&
                    thisRoadIntersections.intersections.at(-1).forward[0].option.cycling && 
                    thisRoadIntersections.intersections.at(-1).forward[0].option.road != road.id
                ) { //long complicated way to say that the last intersection on a non looped road is a single exit to another cycling road
                    thisRoadIntersections.intersections.at(-1).forwardValidForCycling = true;
                }
                if (!road.looped && 
                    !thisRoadIntersections.intersections[0].reverseValidForCycling && 
                    thisRoadIntersections.intersections[0].reverse.length == 1 &&
                    thisRoadIntersections.intersections[0].reverse[0].option.cycling && 
                    thisRoadIntersections.intersections[0].reverse[0].option.road != road.id
                ) { //long complicated way to say that the last intersection on a non looped road is a single exit to another cycling road
                    thisRoadIntersections.intersections[0].reverseValidForCycling = true;
                }
            }
            road.intersections = thisRoadIntersections.intersections || [];
        } else {
            road.intersections = [];
        }
        if (courseId == 8 && (road.id == 249 || road.id == 250)) {//incorrectly marked roads as paddocks in NY
            thisRoadIntersections.roadIsPaddock = false;
        }
        road.roadIsPaddock = thisRoadIntersections.roadIsPaddock || false;
        
        
    };
    for (let road of allCyclingRoads) {
        //now process safe entry targets
        if (road.singleIntersection) {            
            const forwardEntry = road.entryPoints.filter(x => !x.reverse);
            if (forwardEntry.length > 0) {
                forwardEntry.sort((a,b) => a.entryTime - b.entryTime);
                road.safeTargets.forward.start = forwardEntry[0].entryTime + epsilon;
                road.safeTargets.forward.end = road.intersections[0].m_roadTime2 - epsilon;
            };
            const reverseEntry = road.entryPoints.filter(x => x.reverse);
            if (reverseEntry.length > 0) {
                reverseEntry.sort((a,b) => b.entryTime - a.entryTime);
                road.safeTargets.reverse.end = reverseEntry[0].entryTime - epsilon;
                road.safeTargets.reverse.start = road.intersections[0].m_roadTime1 + epsilon;
            };            
        } else if (!road.looped) {
            const validForwardIntersections = road.intersections.filter(x => x.forwardValidForCycling);
            const validReverseIntersections = road.intersections.filter(x => x.reverseValidForCycling);
            const forwardEntryPoints = road.entryPoints.filter(x => !x.reverse);
            forwardEntryPoints.sort((a,b) => a.entryTime - b.entryTime);
            const reverseEntryPoints = road.entryPoints.filter(x => x.reverse);
            reverseEntryPoints.sort((a,b) => b.entryTime - a.entryTime);            
            if (validForwardIntersections.length > 0) {
                if (forwardEntryPoints.length > 1) {
                    const first = forwardEntryPoints[0];
                    const second = forwardEntryPoints[1];
                    const distance = road.curvePath.distanceBetweenRoadPercents(first.entryTime, second.entryTime, 4e-2) / 100;
                    if (second.entryTime < validForwardIntersections[0].m_roadTime1 && distance < 200) {
                        road.safeTargets.forward.start = second.entryTime + epsilon;
                    } else {
                        road.safeTargets.forward.start = first.entryTime + epsilon;
                    };                    
                } else {
                    road.safeTargets.forward.start = forwardEntryPoints[0]?.entryTime + epsilon || 0;
                };
                road.safeTargets.forward.end = validForwardIntersections.at(-1).m_roadTime2 - epsilon;
            };
            if (validReverseIntersections.length > 0) {
                if (reverseEntryPoints.length > 1) {
                    const first = reverseEntryPoints[0];
                    const second = reverseEntryPoints[1];
                    const distance = road.curvePath.distanceBetweenRoadPercents(second.entryTime, first.entryTime, 4e-2) / 100;
                    if (second.entryTime > validReverseIntersections.at(-1).m_roadTime2 && distance < 200) {
                        road.safeTargets.reverse.end = second.entryTime - epsilon;
                    } else {
                        road.safeTargets.reverse.end = first.entryTime - epsilon;
                    }
                } else {
                    road.safeTargets.reverse.end = reverseEntryPoints[0]?.entryTime - epsilon || 1;
                };
                road.safeTargets.reverse.start = validReverseIntersections[0].m_roadTime1 + epsilon;
            };
        };
    }
    allCyclingRoads.sort((a,b) => a.id - b.id);
    const allCyclingRoadsById = Object.fromEntries(allCyclingRoads.map(x => [x.id, x]));
    return allCyclingRoadsById;    
}